import { describe, expect, test } from "bun:test";
import { retire, sweep } from "./ghost-leaf";
import { makeWorld } from "./test-fakes";

describe("retire", () => {
    test("hides and detaches a new empty leaf", () => {
        const w = makeWorld();
        const leaf = w.addLeaf({ type: "empty" });
        retire(w.host, w.asTab(leaf));
        expect(leaf.hidden).toBe(true);
        expect(leaf.detached).toBe(true);
    });

    test("leaves a leaf that shows a file alone", () => {
        const w = makeWorld();
        const real = w.addLeaf({ type: "markdown", viewFile: { path: "a.md" } });
        const emptyWithFile = w.addLeaf({ type: "empty", viewFile: { path: "b.md" } });
        retire(w.host, w.asTab(real));
        retire(w.host, w.asTab(emptyWithFile));
        expect(real.detached).toBe(false);
        expect(real.hidden).toBe(false);
        expect(emptyWithFile.detached).toBe(false);
    });
});

describe("sweep", () => {
    test("detaches hidden empty leaves, even adjacent ones, and spares other leaves", () => {
        const w = makeWorld();
        const ghostA = w.addLeaf({ type: "empty", hidden: true });
        const ghostB = w.addLeaf({ type: "empty", hidden: true });
        const plainEmpty = w.addLeaf({ type: "empty" });
        const hiddenMarkdown = w.addLeaf({ type: "markdown", file: "a.md", hidden: true });
        sweep(w.host);
        expect(ghostA.detached).toBe(true);
        expect(ghostB.detached).toBe(true);
        expect(plainEmpty.detached).toBe(false);
        expect(hiddenMarkdown.detached).toBe(false);
    });
});
