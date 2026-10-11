import type { App, TFile, WorkspaceLeaf } from "obsidian";

// Hand-written stand-ins for the slice of Obsidian that redirect.ts and ghost-leaf.ts touch.
// They encode our reading of Obsidian, not Obsidian itself: timing and focus behaviour is
// verified in a live vault, not here.

export interface FakeLeaf {
    root: "main" | "side";
    viewState: { type: string; state?: { file?: string } };
    view?: { file?: unknown; getViewType(): string };
    classes: Set<string>;
    detached: boolean;
    ephemeral: unknown[];
    containerEl: { addClass(c: string): void; hasClass(c: string): boolean };
    getViewState(): FakeLeaf["viewState"];
    getRoot(): unknown;
    detach(): void;
    setEphemeralState(state: unknown): void;
}

export function makeWorld() {
    const mainRoot = { name: "rootSplit" };
    const sideRoot = { name: "sidebar" };
    const leaves: FakeLeaf[] = [];
    const activated: FakeLeaf[] = [];
    const timers: { fn: () => void; ms: number }[] = [];

    (globalThis as unknown as { window: unknown }).window = {
        setTimeout: (fn: () => void, ms: number) => { timers.push({ fn, ms }); return timers.length; },
    };

    function addLeaf(opts: {
        root?: "main" | "side";
        type?: string;
        file?: string;
        hidden?: boolean;
        viewFile?: unknown;
    } = {}): FakeLeaf {
        const classes = new Set<string>(opts.hidden ? ["unique-tab-hidden"] : []);
        const type = opts.type ?? "markdown";
        const leaf: FakeLeaf = {
            root: opts.root ?? "main",
            viewState: { type, state: opts.file === undefined ? undefined : { file: opts.file } },
            view: { file: opts.viewFile, getViewType: () => type },
            classes,
            detached: false,
            ephemeral: [],
            containerEl: {
                addClass: (c) => { classes.add(c); },
                hasClass: (c) => classes.has(c),
            },
            getViewState: () => leaf.viewState,
            getRoot: () => (leaf.root === "main" ? mainRoot : sideRoot),
            detach: () => {
                leaf.detached = true;
                const i = leaves.indexOf(leaf);
                if (i >= 0) leaves.splice(i, 1);
            },
            setEphemeralState: (state) => { leaf.ephemeral.push(state); },
        };
        leaves.push(leaf);
        return leaf;
    }

    const files: Record<string, { path: string }> = {};

    const app = {
        workspace: {
            rootSplit: mainRoot,
            // Live walk, like Obsidian's: detaching mid-walk skips a sibling.
            iterateAllLeaves(cb: (leaf: WorkspaceLeaf) => void) {
                for (let i = 0; i < leaves.length; i++) cb(leaves[i] as unknown as WorkspaceLeaf);
            },
            setActiveLeaf(leaf: FakeLeaf) { activated.push(leaf); },
        },
        metadataCache: {
            getFirstLinkpathDest: (linkpath: string) => files[linkpath] ?? null,
        },
    } as unknown as App;

    return {
        app,
        leaves,
        activated,
        timers,
        addLeaf,
        addFile(path: string) { files[path] = { path }; return files[path] as unknown as TFile; },
        asLeaf: (l: FakeLeaf) => l as unknown as WorkspaceLeaf,
    };
}

export const links = {
    getLinkpath: (t: string) => t.split("#")[0],
    parseLinktext: (t: string) => {
        const i = t.indexOf("#");
        return i < 0 ? { path: t, subpath: "" } : { path: t.slice(0, i), subpath: t.slice(i) };
    },
};
