import type { OpenViewState, TFile, WorkspaceLeaf } from "obsidian";

type PaneRequest = boolean | "split" | "tab" | "window";
type OpenLinkText = (linktext: string, sourcePath: string, newLeaf?: PaneRequest, openViewState?: OpenViewState) => Promise<void>;
type OpenFile = (file: TFile, openState?: OpenViewState) => Promise<void>;
type AnyFunction = (...args: unknown[]) => unknown;

// The two methods are patched on the shared prototypes, so `Workspace.prototype` and
// `WorkspaceLeaf.prototype` satisfy these as they are.
export interface WorkspacePrototype {
    openLinkText: OpenLinkText;
}

export interface LeafPrototype {
    openFile: OpenFile;
}

// Tab redirect, already bound to the app. Each returns true when a tab was activated
// and the open must not go ahead.
export interface Redirects {
    redirectLink(linktext: string, sourcePath: string, openState?: OpenViewState): boolean;
    redirectOpen(file: TFile, fromLeaf: WorkspaceLeaf, openState?: OpenViewState): boolean;
}

/**
 * Open hooks: patch Obsidian's two open methods so the tab redirect is consulted first.
 * Returns a function that removes both patches.
 *
 * Obsidian exposes no event for "about to open a file", so both hooks patch shared
 * prototypes. If another installed plugin patches the same two methods, behavior depends
 * on patch order — there's no way around this short of Obsidian adding a real
 * interception API.
 */
export function install(workspace: WorkspacePrototype, leaf: LeafPrototype, redirects: Redirects): () => void {
    // 1. openLinkText: opened via link click. An explicit new-pane request (ctrl-click)
    //    is never redirected, so the user can still open a second copy.
    const unhookLink = around(workspace, {
        openLinkText: (next: AnyFunction) =>
            function (this: unknown, linktext: string, sourcePath: string, newLeaf?: PaneRequest, openViewState?: OpenViewState) {
                if (!newLeaf && redirects.redirectLink(linktext, sourcePath, openViewState)) return Promise.resolve();
                return next.call(this, linktext, sourcePath, newLeaf, openViewState) as Promise<void>;
            },
    });

    // 2. openFile: opened via file explorer or quick switcher.
    const unhookFile = around(leaf, {
        openFile: (next: AnyFunction) =>
            function (this: WorkspaceLeaf, file: TFile, openState?: OpenViewState) {
                if (redirects.redirectOpen(file, this, openState)) return Promise.resolve();
                return next.call(this, file, openState) as Promise<void>;
            },
    });

    return () => {
        unhookLink();
        unhookFile();
    };
}

// Monkey-patching helper. `obj` is typically a class prototype, which has no index
// signature — hence the cast below instead of typing the parameter as
// Record<string, unknown>, which `tsc` rejects. Each patch is undone only if it is
// still the outermost one: restoring over another plugin's later patch would drop it.
function around(obj: object, factories: Record<string, (original: AnyFunction) => AnyFunction>): () => void {
    const target = obj as Record<string, AnyFunction>;
    const removers = Object.keys(factories).map((key) => {
        const original = target[key];
        const next = factories[key](original);
        target[key] = next;
        return () => {
            if (target[key] === next) target[key] = original;
        };
    });
    return () => removers.forEach((r) => r());
}
