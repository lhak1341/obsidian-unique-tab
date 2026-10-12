import type { Tab, TabHost } from "./tab-host";

/**
 * Discard `tab` if it is a newly created empty leaf (a ghost leaf in the making):
 * hide it, then detach it. Does nothing for any other leaf.
 */
export function retire(host: TabHost, tab: Tab): void {
    const isNewEmptyLeaf = host.viewType(tab) === "empty" && !host.showsFile(tab);
    if (!isNewEmptyLeaf) return;

    host.hide(tab);

    // Detach synchronously. A deferred `setTimeout` detach can be
    // dropped (e.g. if Obsidian reuses this leaf via workspace.getLeaf()
    // before the callback runs), leaving a permanent hidden "empty" leaf
    // that later hijacks other plugins' getLeaf(false) calls.
    try {
        host.detach(tab);
    } catch {
        // already being torn down elsewhere; ignore
    }
}

/**
 * Self-heal: detach hidden empty leaves left behind by a `retire` whose detach didn't
 * stick. Detaching happens after the walk: `host.leaves()` is a snapshot, so removing one
 * leaf cannot skip a sibling in the same tab group.
 */
export function sweep(host: TabHost): void {
    const ghosts = host.leaves().filter((tab) => host.stateType(tab) === "empty" && host.isHidden(tab));
    for (const ghost of ghosts) host.detach(ghost);
}
