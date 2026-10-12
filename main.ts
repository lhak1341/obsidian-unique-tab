import { Plugin, Workspace, WorkspaceLeaf } from "obsidian";
import { install } from "./open-hooks";
import { createObsidianHost, asTab } from "./obsidian-host";
import { redirectLink, redirectOpen } from "./redirect";
import { sweep } from "./ghost-leaf";
import type { TabHost } from "./tab-host";

export default class NoDuplicatePlugin extends Plugin {
    private host!: TabHost;

    onload() {
        const host = this.host = createObsidianHost(this.app);

        this.register(
            install(Workspace.prototype, WorkspaceLeaf.prototype, {
                redirectLink: (linktext, sourcePath, openState) => redirectLink(host, linktext, sourcePath, openState),
                redirectOpen: (file, fromLeaf, openState) => redirectOpen(host, file, asTab(fromLeaf), openState),
            })
        );

        // Clear ghost leaves a failed detach left behind earlier this session (a ghost is
        // marked by a class on its container, so it can't be recognised after a restart).
        this.app.workspace.onLayoutReady(() => sweep(host));
    }

    onunload() {
        // styles.css goes away with the plugin, so a surviving ghost leaf would turn
        // into a visible empty tab. A failure here must not block unload.
        try {
            sweep(this.host);
        } catch {
            // workspace already tearing down; ignore
        }
    }
}
