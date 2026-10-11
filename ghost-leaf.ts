import type { App, WorkspaceLeaf, TFile } from "obsidian";

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

// Must match the rule in styles.css, which hides the class.
const GHOST_CLASS = 'unique-tab-hidden';

/**
 * Discard `leaf` if it is a newly created empty leaf (a ghost leaf in the making):
 * hide it, then detach it. Does nothing for any other leaf.
 */
export function retire(leaf: WorkspaceLeaf): void {
    const view = leaf.view as unknown as UndocumentedView | undefined;
    const isNewEmptyLeaf = !!leaf.view && !view?.file && leaf.view.getViewType() === "empty";
    if (!isNewEmptyLeaf) return;

    // Hide via CSS class instead of inline style
    const { containerEl } = leaf as unknown as UndocumentedLeaf;
    if (containerEl) {
        containerEl.addClass(GHOST_CLASS);
    }

    // Detach synchronously. A deferred `setTimeout` detach can be
    // dropped (e.g. if Obsidian reuses this leaf via workspace.getLeaf()
    // before the callback runs), leaving a permanent hidden "empty" leaf
    // that later hijacks other plugins' getLeaf(false) calls.
    try {
        leaf.detach();
    } catch {
        // already being torn down elsewhere; ignore
    }
}

/**
 * Self-heal: detach hidden empty leaves left behind by a `retire` whose detach didn't
 * stick. Detaching is deferred until after the walk — iterateAllLeaves walks the live
 * split/tab tree, and detaching mid-walk would splice a sibling out from under it,
 * risking a skipped leaf in the same tab group.
 */
export function sweep(app: App): void {
    const ghosts: WorkspaceLeaf[] = [];

    app.workspace.iterateAllLeaves((leaf) => {
        const containerEl = (leaf as unknown as UndocumentedLeaf).containerEl;
        if (leaf.getViewState().type === "empty" && containerEl?.hasClass(GHOST_CLASS)) {
            ghosts.push(leaf);
        }
    });

    for (const ghost of ghosts) ghost.detach();
}
