import type { App, WorkspaceLeaf, TFile, OpenViewState } from "obsidian";
import { retire, sweep } from "./ghost-leaf";

// The two link-parsing functions from "obsidian", passed in because that package ships
// types only: importing them here would make this module unloadable outside Obsidian.
export interface Links {
    getLinkpath(linktext: string): string;
    parseLinktext(linktext: string): { path: string; subpath: string };
}

// Empirically-tuned delay — see call site for why it is needed.
const ACTIVATE_AFTER_OPEN_FILE_DELAY_MS = 10;

/**
 * Link intent: redirect to the existing tab for the link's target, if any.
 * Returns true when a tab was activated and the caller must not open the file.
 */
export function redirectLink(app: App, links: Links, linktext: string, sourcePath: string, openState?: OpenViewState): boolean {
    const targetFile = app.metadataCache.getFirstLinkpathDest(
        links.getLinkpath(linktext),
        sourcePath
    );

    if (!targetFile) return false;
    // "#Heading" / "#^block-id" part of the link; empty when the link has none
    const { subpath } = links.parseLinktext(linktext);
    return activateLeafByPath(app, targetFile.path, subpath || null, null, false, openState);
}

/**
 * Open intent: redirect to the existing tab for `file`, if any. `fromLeaf` is the leaf
 * Obsidian is about to load the file into. Returns true when a tab was activated and the
 * caller must not open the file.
 */
export function redirectOpen(app: App, file: TFile, fromLeaf: WorkspaceLeaf, openState?: OpenViewState): boolean {
    // Try to jump to an existing tab with this file open
    const leafFound = activateLeafByPath(app, file.path, null, fromLeaf, true, openState);
    if (!leafFound) return false;

    retire(fromLeaf);

    return true;
}

function activateLeafByPath(app: App, path: string, subpath: string | null = null, ignoreLeaf: WorkspaceLeaf | null = null, delay: boolean = false, openState?: OpenViewState): boolean {
    let foundLeaf: WorkspaceLeaf | null = null;

    sweep(app);

    app.workspace.iterateAllLeaves((leaf) => {
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
        // Caller passed a specific open state (e.g. a line/anchor requested by the
        // dashboard) — apply it to the existing leaf, otherwise we just jump to the
        // old tab without actually opening what the caller asked for. Absent that, a
        // link's #heading / #^block target goes through Obsidian's own subpath scroll,
        // the same state it uses when opening a link. Canvas/base views don't support it.
        const eState: unknown = openState?.eState
            ?? (subpath && leaf.getViewState().type === "markdown" ? { subpath } : undefined);
        const activate = () => {
            app.workspace.setActiveLeaf(leaf, { focus: true });
            if (eState) leaf.setEphemeralState(eState);
        };

        // The openFile hook runs before Obsidian finishes its own focus handling for
        // the leaf it just created, which can re-steal focus right after we call
        // setActiveLeaf synchronously. Deferring past that lets our activation win.
        if (delay) {
            window.setTimeout(activate, ACTIVATE_AFTER_OPEN_FILE_DELAY_MS);
        } else {
            activate();
        }

        return true;
    }
    return false;
}
