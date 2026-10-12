import { getLinkpath, parseLinktext } from "obsidian";
import type { App, TFile, WorkspaceLeaf } from "obsidian";
import type { Tab, TabHost } from "./tab-host";

// The Obsidian adapter for TabHost. It imports runtime functions from "obsidian", which
// ships types only, so bun tests cannot load it: the live vault verifies it.

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

export function asTab(leaf: WorkspaceLeaf): Tab {
    return leaf as unknown as Tab;
}

function leafOf(tab: Tab): WorkspaceLeaf {
    return tab as unknown as WorkspaceLeaf;
}

function containerOf(tab: Tab): HTMLElement | undefined {
    return (leafOf(tab) as unknown as UndocumentedLeaf).containerEl;
}

export function createObsidianHost(app: App): TabHost {
    return {
        leaves() {
            const all: Tab[] = [];
            app.workspace.iterateAllLeaves((leaf) => { all.push(asTab(leaf)); });
            return all;
        },
        inMainArea: (tab) => leafOf(tab).getRoot() === app.workspace.rootSplit,
        stateFile(tab) {
            const file = leafOf(tab).getViewState().state?.file;
            return typeof file === "string" ? file : undefined;
        },
        stateType: (tab) => leafOf(tab).getViewState().type,
        viewType: (tab) => leafOf(tab).view?.getViewType(),
        showsFile: (tab) => !!(leafOf(tab).view as unknown as UndocumentedView | undefined)?.file,
        isHidden: (tab) => !!containerOf(tab)?.hasClass(GHOST_CLASS),
        hide(tab) {
            // Hide via CSS class instead of inline style
            containerOf(tab)?.addClass(GHOST_CLASS);
        },
        detach: (tab) => { leafOf(tab).detach(); },
        activate(tab, eState) {
            const leaf = leafOf(tab);
            app.workspace.setActiveLeaf(leaf, { focus: true });
            if (eState) leaf.setEphemeralState(eState);
        },
        resolveLink(linktext, sourcePath) {
            const file = app.metadataCache.getFirstLinkpathDest(getLinkpath(linktext), sourcePath);
            if (!file) return null;
            return { path: file.path, subpath: parseLinktext(linktext).subpath };
        },
        later: (ms, fn) => { window.setTimeout(fn, ms); },
    };
}
