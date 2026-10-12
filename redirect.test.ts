import { describe, expect, test } from "bun:test";
import { redirectLink, redirectOpen } from "./redirect";
import { makeWorld } from "./test-fakes";

describe("tab matching", () => {
    test("a sidebar leaf mirroring the file is not a tab", () => {
        const w = makeWorld();
        const file = w.addFile("a.md");
        w.addLeaf({ root: "side", file: "a.md" });
        const from = w.addLeaf({ type: "empty" });
        expect(redirectOpen(w.host, file, w.asTab(from), undefined)).toBe(false);
        expect(w.activated).toHaveLength(0);
    });

    test("the leaf being opened into never matches itself", () => {
        const w = makeWorld();
        const file = w.addFile("a.md");
        const from = w.addLeaf({ file: "a.md" });
        expect(redirectOpen(w.host, file, w.asTab(from), undefined)).toBe(false);
        expect(w.activated).toHaveLength(0);
    });

    test("a missing or empty state.file never matches", () => {
        const w = makeWorld();
        const file = w.addFile("");
        w.addLeaf({ file: "" });
        w.addLeaf({ file: undefined });
        const from = w.addLeaf({ type: "empty" });
        expect(redirectOpen(w.host, file, w.asTab(from), undefined)).toBe(false);
    });

    test("no matching tab: returns false and touches nothing", () => {
        const w = makeWorld();
        const file = w.addFile("a.md");
        w.addLeaf({ file: "other.md" });
        const from = w.addLeaf({ type: "empty" });
        expect(redirectOpen(w.host, file, w.asTab(from), undefined)).toBe(false);
        expect(w.activated).toHaveLength(0);
        expect(w.timers).toHaveLength(0);
        expect(from.detached).toBe(false);
        expect(from.hidden).toBe(false);
    });

    test("an unresolvable link is not redirected", () => {
        const w = makeWorld();
        w.addLeaf({ file: "a.md" });
        expect(redirectLink(w.host, "missing", "src.md", undefined)).toBe(false);
    });
});

describe("activation timing", () => {
    test("link intent activates synchronously", () => {
        const w = makeWorld();
        w.addFile("a");
        const tab = w.addLeaf({ file: "a" });
        expect(redirectLink(w.host, "a", "src.md", undefined)).toBe(true);
        expect(w.activated).toEqual([tab]);
        expect(w.timers).toHaveLength(0);
    });

    test("open intent defers activation by 10 ms and retires the new leaf", () => {
        const w = makeWorld();
        const file = w.addFile("a.md");
        const tab = w.addLeaf({ file: "a.md" });
        const from = w.addLeaf({ type: "empty" });
        expect(redirectOpen(w.host, file, w.asTab(from), undefined)).toBe(true);
        expect(w.activated).toHaveLength(0);
        expect(w.timers.map((t) => t.ms)).toEqual([10]);
        w.timers[0].fn();
        expect(w.activated).toEqual([tab]);
        expect(from.detached).toBe(true);
    });
});

describe("open state", () => {
    test("a link's subpath scrolls a markdown tab", () => {
        const w = makeWorld();
        w.addFile("a");
        const tab = w.addLeaf({ file: "a", type: "markdown" });
        redirectLink(w.host, "a#Heading", "src.md", undefined);
        expect(tab.ephemeral).toEqual([{ subpath: "#Heading" }]);
    });

    test("the subpath is not applied to a non-markdown tab", () => {
        const w = makeWorld();
        w.addFile("a");
        const tab = w.addLeaf({ file: "a", type: "canvas" });
        redirectLink(w.host, "a#Heading", "src.md", undefined);
        expect(tab.ephemeral).toEqual([]);
    });

    test("a caller's explicit eState wins over the link's subpath", () => {
        const w = makeWorld();
        w.addFile("a");
        const tab = w.addLeaf({ file: "a", type: "markdown" });
        redirectLink(w.host, "a#Heading", "src.md", { eState: { line: 7 } });
        expect(tab.ephemeral).toEqual([{ line: 7 }]);
    });

    test("a link without an anchor sets no state", () => {
        const w = makeWorld();
        w.addFile("a");
        const tab = w.addLeaf({ file: "a" });
        redirectLink(w.host, "a", "src.md", undefined);
        expect(tab.ephemeral).toEqual([]);
    });
});

describe("ghost handling inside a redirect", () => {
    test("stale ghost leaves are swept before the search", () => {
        const w = makeWorld();
        const file = w.addFile("a.md");
        const ghost = w.addLeaf({ type: "empty", hidden: true });
        w.addLeaf({ file: "a.md" });
        const from = w.addLeaf({ type: "empty" });
        redirectOpen(w.host, file, w.asTab(from), undefined);
        expect(ghost.detached).toBe(true);
    });
});
