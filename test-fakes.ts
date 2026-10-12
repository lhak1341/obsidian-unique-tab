import type { TFile } from "obsidian";
import type { Tab, TabHost } from "./tab-host";

// The test adapter for TabHost. It encodes our reading of Obsidian, not Obsidian itself:
// timing and focus behaviour is verified in a live vault, not here.

export interface FakeLeaf {
    root: "main" | "side";
    type: string;
    file?: string;
    viewFile?: unknown;
    hidden: boolean;
    detached: boolean;
    ephemeral: unknown[];
}

export function makeWorld() {
    const leaves: FakeLeaf[] = [];
    const activated: FakeLeaf[] = [];
    const timers: { fn: () => void; ms: number }[] = [];
    const files: Record<string, { path: string }> = {};

    const as = (t: Tab) => t as unknown as FakeLeaf;

    const host: TabHost = {
        // A snapshot, like the Obsidian adapter's: detaching while walking it is safe.
        leaves: () => leaves.map((l) => l as unknown as Tab),
        inMainArea: (t) => as(t).root === "main",
        stateFile: (t) => as(t).file,
        stateType: (t) => as(t).type,
        viewType: (t) => as(t).type,
        showsFile: (t) => !!as(t).viewFile,
        isHidden: (t) => as(t).hidden,
        hide: (t) => { as(t).hidden = true; },
        detach: (t) => {
            const leaf = as(t);
            leaf.detached = true;
            const i = leaves.indexOf(leaf);
            if (i >= 0) leaves.splice(i, 1);
        },
        activate: (t, eState) => {
            activated.push(as(t));
            if (eState) as(t).ephemeral.push(eState);
        },
        resolveLink: (linktext) => {
            const i = linktext.indexOf("#");
            const path = i < 0 ? linktext : linktext.slice(0, i);
            const subpath = i < 0 ? "" : linktext.slice(i);
            return files[path] ? { path, subpath } : null;
        },
        later: (ms, fn) => { timers.push({ fn, ms }); },
    };

    function addLeaf(opts: {
        root?: "main" | "side";
        type?: string;
        file?: string;
        hidden?: boolean;
        viewFile?: unknown;
    } = {}): FakeLeaf {
        const leaf: FakeLeaf = {
            root: opts.root ?? "main",
            type: opts.type ?? "markdown",
            file: opts.file,
            viewFile: opts.viewFile,
            hidden: opts.hidden ?? false,
            detached: false,
            ephemeral: [],
        };
        leaves.push(leaf);
        return leaf;
    }

    return {
        host,
        leaves,
        activated,
        timers,
        addLeaf,
        addFile(path: string) { files[path] = { path }; return files[path] as unknown as TFile; },
        asTab: (l: FakeLeaf) => l as unknown as Tab,
    };
}
