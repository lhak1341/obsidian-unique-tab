import { 
    App, 
    Plugin, 
    WorkspaceLeaf, 
    Workspace, 
    MarkdownView, 
    getLinkpath, 
    TFile, 
    OpenViewState
} from "obsidian";

type AnyFunction = (...args: unknown[]) => unknown;

// Undocumented API surface. `View.file` exists on file-backed views but isn't declared on
// the base class, and `WorkspaceLeaf.containerEl` isn't part of the public API at all.
// Typed here and reached via `as unknown as` casts rather than @ts-ignore, which lint
// blocks and which suppresses every error on its line, not just the intended one.
interface UndocumentedView {
    file?: TFile;
}

interface UndocumentedLeaf {
    containerEl?: HTMLElement;
}

// Empirically-tuned delays — see call sites for why each is needed.
const ACTIVATE_AFTER_OPEN_FILE_DELAY_MS = 10;
const SCROLL_TO_ANCHOR_DELAY_MS = 20;

export default class NoDuplicatePlugin extends Plugin {
    onload() {
        // Both hooks below monkeypatch shared prototypes (Workspace.prototype,
        // WorkspaceLeaf.prototype) rather than per-instance methods, since Obsidian
        // exposes no event/hook for "about to open a file". If another installed
        // plugin patches the same two methods, behavior depends on patch order —
        // there's no way around this short of Obsidian adding a real interception API.

        // 1. Intercept openLinkText (opened via link click)
        this.register(
            around(Workspace.prototype, {
                openLinkText: (next: AnyFunction) => {
                    const app = this.app;
                    return function (this: Workspace, linktext: string, sourcePath: string, newLeaf?: boolean | "split" | "tab" | "window", openViewState?: OpenViewState) {
                        if (newLeaf) return next.call(this, linktext, sourcePath, newLeaf, openViewState) as Promise<void>;

                        const targetFile = app.metadataCache.getFirstLinkpathDest(
                            getLinkpath(linktext),
                            sourcePath
                        );

                        if (targetFile) {
                            if (activateLeafByPath(app, targetFile.path, linktext, null, false, openViewState)) return;
                        }
                        return next.call(this, linktext, sourcePath, newLeaf, openViewState) as Promise<void>;
                    };
                },
            })
        );

        // 2. Intercept openFile (opened via file explorer or quick switcher)
        this.register(
            around(WorkspaceLeaf.prototype, {
                openFile: (next: AnyFunction) => {
                    const app = this.app;
                    return function (this: WorkspaceLeaf, file: TFile, openState?: OpenViewState) {
                        // Try to jump to an existing tab with this file open
                        const leafFound = activateLeafByPath(app, file.path, null, this, true, openState);

                        if (leafFound) {
                            // Check whether the current leaf is a newly created empty leaf
                            const view = this.view as unknown as UndocumentedView | undefined;
                            const isNewEmptyLeaf = !!this.view && !view?.file && this.view.getViewType() === "empty";

                            if (isNewEmptyLeaf) {
                                // Hide via CSS class instead of inline style
                                const { containerEl } = this as unknown as UndocumentedLeaf;
                                if (containerEl) {
                                    containerEl.addClass('unique-tab-hidden');
                                }

                                // Detach synchronously. A deferred `setTimeout` detach can be
                                // dropped (e.g. if Obsidian reuses this leaf via workspace.getLeaf()
                                // before the callback runs), leaving a permanent hidden "empty" leaf
                                // that later hijacks other plugins' getLeaf(false) calls.
                                try {
                                    this.detach();
                                } catch {
                                    // already being torn down elsewhere; ignore
                                }
                            }

                            return Promise.resolve(); 
                        }

                        return next.call(this, file, openState) as Promise<void>;
                    };
                },
            })
        );
    }

}

// --- Helpers ---

function activateLeafByPath(app: App, path: string, linktext: string | null = null, ignoreLeaf: WorkspaceLeaf | null = null, delay: boolean = false, openState?: OpenViewState): boolean {
    let foundLeaf: WorkspaceLeaf | null = null;
    const staleGhostLeaves: WorkspaceLeaf[] = [];

    app.workspace.iterateAllLeaves((leaf) => {
        // Self-heal: find hidden empty leaves left behind by a prior interception
        // whose detach didn't stick (see openFile hook above). Detaching is deferred
        // until after this loop finishes — iterateAllLeaves walks the live split/tab
        // tree, and detaching mid-walk would splice a sibling out from under it,
        // risking a skipped leaf in the same tab group.
        const leafContainerEl = (leaf as unknown as UndocumentedLeaf).containerEl;
        if (leaf.getViewState().type === "empty" && leafContainerEl?.hasClass('unique-tab-hidden')) {
            staleGhostLeaves.push(leaf);
            return;
        }

        if (foundLeaf) return;
        if (ignoreLeaf && leaf === ignoreLeaf) return;

        // Only match real content tabs in the main editor area. Sidebar panels
        // (file-properties, localgraph, backlinks, outline, ...) mirror whatever
        // file is contextually active in their `state.file` too, but they aren't
        // "this file open in a tab" — jumping to them leaves the main area untouched.
        if (leaf.getRoot() !== app.workspace.rootSplit) return;

        const viewState = leaf.getViewState();

        // Guard against undefined/empty values matching by accident
        const leafFile = viewState.state?.file;
        const isMatch =
            typeof leafFile === 'string' &&
            leafFile.length > 0 &&
            leafFile === path;

        if (isMatch) foundLeaf = leaf;
    });

    for (const ghost of staleGhostLeaves) ghost.detach();

    if (foundLeaf) {
        const leaf = foundLeaf;
        const activate = () => {
            app.workspace.setActiveLeaf(leaf, { focus: true });
            // Caller passed a specific open state (e.g. a line/anchor requested by the
            // dashboard) — apply it to the existing leaf, otherwise we just jump to the
            // old tab without actually opening what the caller asked for
            if (openState?.eState) leaf.setEphemeralState(openState.eState);
        };

        // The openFile hook runs before Obsidian finishes its own focus handling for
        // the leaf it just created, which can re-steal focus right after we call
        // setActiveLeaf synchronously. Deferring past that lets our activation win.
        if (delay) {
            window.setTimeout(activate, ACTIVATE_AFTER_OPEN_FILE_DELAY_MS);
        } else {
            activate();
        }

        // Only scroll to the anchor if we came from a link click (has a # heading target)
        // and the target is a regular note
        if (linktext) {
             const viewState = leaf.getViewState();
             // Canvas/base views generally don't support this kind of scroll anchor
             if (viewState.type === "markdown") {
                 // Give the markdown view/editor a tick to finish mounting before we
                 // set the cursor and scroll, otherwise the scroll can silently no-op.
                 window.setTimeout(() => scrollToElement(app, linktext, leaf), SCROLL_TO_ANCHOR_DELAY_MS);
             }
        }
        return true;
    }
    return false;
}

function scrollToElement(app: App, linktext: string, leaf: WorkspaceLeaf) {
    const hashMatch = linktext.match(/(#|\^)(.*)$/);
    if (!hashMatch) return; 

    // Cast to MarkdownView to get at the editor
    const view = leaf.view as MarkdownView;
    if (!view || !view.editor) return;
    if (!view.file) return;

    const cache = app.metadataCache.getFileCache(view.file);
    if (!cache) return;

    const type = hashMatch[1];
    const name = hashMatch[2];

    let line = -1;

    if (type === "#") {
        const heading = cache.headings?.find(h => h.heading === name);
        if (heading) line = heading.position.start.line;
    } else if (type === "^") {
        const block = cache.blocks?.[name];
        if (block) line = block.position.start.line;
    }

    if (line >= 0) {
        view.editor.setCursor({ line: line, ch: 0 });
        view.editor.scrollIntoView({ from: { line: line, ch: 0 }, to: { line: line, ch: 0 } }, true);
    }
}

// Monkey-patching helper. `obj` is typically a class prototype (Workspace.prototype,
// WorkspaceLeaf.prototype, ...), which has no index signature — hence the cast below
// instead of typing the parameter as Record<string, unknown>, which `tsc` rejects.
// Returns a cleanup function for this.register(), so hooks unwind cleanly on unload.
function around(obj: object, factories: Record<string, (original: AnyFunction) => AnyFunction>): () => void {
    const target = obj as Record<string, AnyFunction>;
    const removers = Object.keys(factories).map((key) => {
        const prev = target[key];
        const next = factories[key](prev);
        const original = prev;
        target[key] = next;
        return () => {
            if (target[key] === next) target[key] = original;
        };
    });
    // this.register() expects a plain function
    return () => removers.forEach((r) => r());
}
