import { describe, expect, test } from "bun:test";
import type { TFile, WorkspaceLeaf } from "obsidian";
import { install } from "./open-hooks";

function setup(redirected: boolean) {
    const calls: string[] = [];
    const workspace = {
        openLinkText: (..._args: unknown[]) => { calls.push("origLink"); return Promise.resolve(); },
    };
    const leaf = {
        openFile: (..._args: unknown[]) => { calls.push("origFile"); return Promise.resolve(); },
    };
    const originalLink = workspace.openLinkText;
    const originalFile = leaf.openFile;
    const unhook = install(workspace, leaf, {
        redirectLink: () => { calls.push("redirectLink"); return redirected; },
        redirectOpen: () => { calls.push("redirectOpen"); return redirected; },
    });
    return { calls, workspace, leaf, unhook, originalLink, originalFile };
}

const file = {} as TFile;
const fromLeaf = {} as WorkspaceLeaf;

describe("openLinkText hook", () => {
    test("a redirect resolves a promise and skips the original", async () => {
        const s = setup(true);
        const result = s.workspace.openLinkText("a", "src.md");
        expect(result).toBeInstanceOf(Promise);
        await result;
        expect(s.calls).toEqual(["redirectLink"]);
    });

    test("no redirect falls through to the original", async () => {
        const s = setup(false);
        await s.workspace.openLinkText("a", "src.md");
        expect(s.calls).toEqual(["redirectLink", "origLink"]);
    });

    test.each([true, "tab", "split", "window"] as const)("newLeaf %p skips the redirect", async (newLeaf) => {
        const s = setup(true);
        await s.workspace.openLinkText("a", "src.md", newLeaf);
        expect(s.calls).toEqual(["origLink"]);
    });
});

describe("openFile hook", () => {
    test("a redirect resolves a promise and skips the original", async () => {
        const s = setup(true);
        const result = s.leaf.openFile(file);
        expect(result).toBeInstanceOf(Promise);
        await result;
        expect(s.calls).toEqual(["redirectOpen"]);
    });

    test("no redirect falls through to the original", async () => {
        const s = setup(false);
        await s.leaf.openFile(file);
        expect(s.calls).toEqual(["redirectOpen", "origFile"]);
    });

    test("the leaf being opened into is passed as fromLeaf", () => {
        const seen: unknown[] = [];
        const leaf = { openFile: (..._args: unknown[]) => Promise.resolve() };
        install({ openLinkText: () => Promise.resolve() }, leaf, {
            redirectLink: () => false,
            redirectOpen: (_f, from) => { seen.push(from); return false; },
        });
        void leaf.openFile.call(fromLeaf, file);
        expect(seen).toEqual([fromLeaf]);
    });
});

describe("unhook", () => {
    test("restores both originals", () => {
        const s = setup(false);
        s.unhook();
        expect(s.workspace.openLinkText).toBe(s.originalLink);
        expect(s.leaf.openFile).toBe(s.originalFile);
    });

    test("leaves another plugin's later patch in place", () => {
        const s = setup(false);
        const theirs = (..._args: unknown[]) => Promise.resolve();
        s.workspace.openLinkText = theirs;
        s.unhook();
        expect(s.workspace.openLinkText).toBe(theirs);
        expect(s.leaf.openFile).toBe(s.originalFile);
    });
});
