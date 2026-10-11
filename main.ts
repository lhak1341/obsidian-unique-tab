import {
    Plugin,
    WorkspaceLeaf,
    Workspace,
    TFile,
    OpenViewState,
    getLinkpath,
    parseLinktext
} from "obsidian";
import { redirectLink, redirectOpen } from "./redirect";
import { sweep } from "./ghost-leaf";

const links = { getLinkpath, parseLinktext };

type AnyFunction = (...args: unknown[]) => unknown;

export default class NoDuplicatePlugin extends Plugin {
    onload() {
        // Both hooks below monkeypatch shared prototypes (Workspace.prototype,
        // WorkspaceLeaf.prototype) rather than per-instance methods, since Obsidian
        // exposes no event/hook for "about to open a file". If another installed
        // plugin patches the same two methods, behavior depends on patch order —
        // there's no way around this short of Obsidian adding a real interception API.

        // 1. Intercept openLinkText (opened via link click)
        this.register(
            around(Workspace.prototype, {
                openLinkText: (next: AnyFunction) => {
                    const app = this.app;
                    return function (this: Workspace, linktext: string, sourcePath: string, newLeaf?: boolean | "split" | "tab" | "window", openViewState?: OpenViewState) {
                        if (newLeaf) return next.call(this, linktext, sourcePath, newLeaf, openViewState) as Promise<void>;

                        if (redirectLink(app, links, linktext, sourcePath, openViewState)) return;
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
                        if (redirectOpen(app, file, this, openState)) return Promise.resolve();

                        return next.call(this, file, openState) as Promise<void>;
                    };
                },
            })
        );

        // Clear ghost leaves persisted in the saved layout or left by a failed detach.
        this.app.workspace.onLayoutReady(() => sweep(this.app));
    }

    onunload() {
        // styles.css goes away with the plugin, so a surviving ghost leaf would turn
        // into a visible empty tab. A failure here must not block unload.
        try {
            sweep(this.app);
        } catch {
            // workspace already tearing down; ignore
        }
    }
}

// Monkey-patching helper. `obj` is typically a class prototype (Workspace.prototype,
// WorkspaceLeaf.prototype, ...), which has no index signature — hence the cast below
// instead of typing the parameter as Record<string, unknown>, which `tsc` rejects.
// Returns a cleanup function for this.register(), so hooks unwind cleanly on unload.
function around(obj: object, factories: Record<string, (original: AnyFunction) => AnyFunction>): () => void {
    const target = obj as Record<string, AnyFunction>;
    const removers = Object.keys(factories).map((key) => {
        const prev = target[key];
        const next = factories[key](prev);
        const original = prev;
        target[key] = next;
        return () => {
            if (target[key] === next) target[key] = original;
        };
    });
    // this.register() expects a plain function
    return () => removers.forEach((r) => r());
}
