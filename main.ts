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

export default class NoDuplicatePlugin extends Plugin {
    async onload() {
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
                            // @ts-ignore: `file` isn't strongly typed on all View subclasses
                            const isNewEmptyLeaf = this.view && !this.view.file && this.view.getViewType() === "empty";

                            if (isNewEmptyLeaf) {
                                // Hide via CSS class instead of inline style
                                // @ts-ignore: containerEl isn't part of the public API
                                const containerEl = this.containerEl as HTMLElement;
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

    app.workspace.iterateAllLeaves((leaf) => {
        // Self-heal: sweep up any hidden empty leaves left behind by a prior
        // interception whose detach didn't stick (see openFile hook above).
        // @ts-ignore: containerEl isn't part of the public API
        const leafContainerEl = leaf.containerEl as HTMLElement | undefined;
        if (leaf.getViewState().type === "empty" && leafContainerEl?.hasClass('unique-tab-hidden')) {
            leaf.detach();
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

    if (foundLeaf) {
        const leaf = foundLeaf;
        const activate = () => {
            app.workspace.setActiveLeaf(leaf, { focus: true });
            // Caller passed a specific open state (e.g. a line/anchor requested by the
            // dashboard) — apply it to the existing leaf, otherwise we just jump to the
            // old tab without actually opening what the caller asked for
            if (openState?.eState) leaf.setEphemeralState(openState.eState);
        };

        // Delay to work around focus getting stolen back
        if (delay) {
            window.setTimeout(activate, 10);
        } else {
            activate();
        }

        // Only scroll to the anchor if we came from a link click (has a # heading target)
        // and the target is a regular note
        if (linktext) {
             const viewState = leaf.getViewState();
             // Canvas/base views generally don't support this kind of scroll anchor
             if (viewState.type === "markdown") {
                 window.setTimeout(() => scrollToElement(app, linktext, leaf), 20);
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

// Monkey-patching helper.
// Returns a cleanup function for this.register(), so hooks unwind cleanly on unload.
function around(obj: Record<string, unknown>, factories: Record<string, (original: AnyFunction) => AnyFunction>): () => void {
    const removers = Object.keys(factories).map((key) => {
        const prev = obj[key] as AnyFunction;
        const next = factories[key](prev);
        const original = prev;
        obj[key] = next;
        return () => {
            if (obj[key] === next) obj[key] = original;
        };
    });
    // this.register() expects a plain function
    return () => removers.forEach((r) => r());
}
