declare const tabBrand: unique symbol;

/** A workspace leaf, opaque to the modules that decide what to do with it. */
export interface Tab {
    readonly [tabBrand]: true;
}

/**
 * Everything the tab redirect and ghost leaf modules need to know about, or do to, the
 * workspace. Facts only: the decisions (what counts as a match, a new empty leaf, a ghost)
 * stay in those modules. Adapters: `obsidian-host.ts` in the plugin, `test-fakes.ts` in tests.
 */
export interface TabHost {
    /** Every leaf in the workspace, main area, sidebars and popouts. A snapshot, safe to detach from. */
    leaves(): Tab[];
    inMainArea(tab: Tab): boolean;
    /** The file named by the leaf's saved view state, if any. */
    stateFile(tab: Tab): string | undefined;
    /** The type named by the leaf's saved view state. */
    stateType(tab: Tab): string;
    /** The type of the leaf's live view; undefined when it has none. */
    viewType(tab: Tab): string | undefined;
    /** Whether the leaf's live view has a file loaded. */
    showsFile(tab: Tab): boolean;
    isHidden(tab: Tab): boolean;
    hide(tab: Tab): void;
    detach(tab: Tab): void;
    /** Focus the tab and, when given, apply an ephemeral view state (scroll to an anchor or line). */
    activate(tab: Tab, eState?: unknown): void;
    /** The file a link points at, with its anchor (`#Heading` / `#^block`, empty if none). Null if it resolves to no file. */
    resolveLink(linktext: string, sourcePath: string): { path: string; subpath: string } | null;
    later(ms: number, fn: () => void): void;
}
