import type { OpenViewState, TFile } from "obsidian";
import { retire, sweep } from "./ghost-leaf";
import type { Tab, TabHost } from "./tab-host";

// Empirically-tuned delay — see call site for why it is needed.
const ACTIVATE_AFTER_OPEN_FILE_DELAY_MS = 10;

/**
 * Link intent: redirect to the existing tab for the link's target, if any.
 * Returns true when a tab was activated and the caller must not open the file.
 */
export function redirectLink(host: TabHost, linktext: string, sourcePath: string, openState?: OpenViewState): boolean {
    const target = host.resolveLink(linktext, sourcePath);
    if (!target) return false;

    const tab = findTab(host, target.path, null);
    if (!tab) return false;

    // `subpath` is the "#Heading" / "#^block-id" part of the link; empty when the link has none
    host.activate(tab, eStateFor(host, tab, openState, target.subpath));
    return true;
}

/**
 * Open intent: redirect to the existing tab for `file`, if any. `fromTab` is the leaf
 * Obsidian is about to load the file into. Returns true when a tab was activated and the
 * caller must not open the file.
 */
export function redirectOpen(host: TabHost, file: TFile, fromTab: Tab, openState?: OpenViewState): boolean {
    // Try to jump to an existing tab with this file open
    const tab = findTab(host, file.path, fromTab);
    if (!tab) return false;

    // The openFile hook runs before Obsidian finishes its own focus handling for
    // the leaf it just created, which can re-steal focus right after we call
    // setActiveLeaf synchronously. Deferring past that lets our activation win.
    const eState = eStateFor(host, tab, openState, "");
    host.later(ACTIVATE_AFTER_OPEN_FILE_DELAY_MS, () => host.activate(tab, eState));

    retire(host, fromTab);

    return true;
}

/**
 * The tab in the main editor area showing `path`, other than `ignoreTab`. Sweeps ghost
 * leaves first, so a stale one can never match.
 */
function findTab(host: TabHost, path: string, ignoreTab: Tab | null): Tab | null {
    sweep(host);

    return host.leaves().find((tab) => {
        if (tab === ignoreTab) return false;

        // Only match real content tabs in the main editor area. Sidebar panels
        // (file-properties, localgraph, backlinks, outline, ...) mirror whatever
        // file is contextually active in their `state.file` too, but they aren't
        // "this file open in a tab" — jumping to them leaves the main area untouched.
        if (!host.inMainArea(tab)) return false;

        // Guard against undefined/empty values matching by accident
        const tabFile = host.stateFile(tab);
        return !!tabFile && tabFile === path;
    }) ?? null;
}

// Caller passed a specific open state (e.g. a line/anchor requested by the
// dashboard) — apply it to the existing tab, otherwise we just jump to the
// old tab without actually opening what the caller asked for. Absent that, a
// link's #heading / #^block target goes through Obsidian's own subpath scroll,
// the same state it uses when opening a link. Canvas/base views don't support it.
function eStateFor(host: TabHost, tab: Tab, openState: OpenViewState | undefined, subpath: string): unknown {
    return openState?.eState
        ?? (subpath && host.stateType(tab) === "markdown" ? { subpath } : undefined);
}
