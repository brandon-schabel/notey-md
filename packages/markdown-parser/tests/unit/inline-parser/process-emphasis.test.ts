import type { MarkdownNode } from "@/ast";
import { processEmphasis } from "@/inline-parser";
import { test, describe, expect } from "bun:test";

describe("processEmphasis", () => {
    test("converts single pair of * delimiters into emphasis node", () => {
        const nodes: MarkdownNode[] = [
            { type: "text", value: "Hello " },
            { type: "text", value: "*" },
            { type: "text", value: "world" },
            { type: "text", value: "*" },
        ];
        const delims = [
            { idx: 1, length: 1, char: "*", canOpen: true, canClose: false },
            { idx: 3, length: 1, char: "*", canOpen: false, canClose: true },
        ];
        processEmphasis(nodes, delims);
        expect(nodes.length).toBe(2);
        expect(nodes[0]).toEqual({ type: "text", value: "Hello " });
        expect(nodes[1].type).toBe("emphasis");
        if (nodes[1].type === "emphasis") {
            expect(nodes[1].children).toEqual([{ type: "text", value: "world" }]);
        }
    });

    test("converts ** into strong node", () => {
        const nodes: MarkdownNode[] = [
            { type: "text", value: "**" },
            { type: "text", value: "bold" },
            { type: "text", value: "**" },
        ];
        const delims = [
            { idx: 0, length: 2, char: "*", canOpen: true, canClose: false },
            { idx: 2, length: 2, char: "*", canOpen: false, canClose: true },
        ];
        processEmphasis(nodes, delims);
        expect(nodes.length).toBe(1);
        expect(nodes[0].type).toBe("strong");
    });

    test("does not create emphasis node if canOpen/canClose flags do not match", () => {
        const nodes: MarkdownNode[] = [
            { type: "text", value: "*" },
            { type: "text", value: "something" },
            { type: "text", value: "*" },
        ];
        const delims = [
            { idx: 0, length: 1, char: "*", canOpen: false, canClose: false },
            { idx: 2, length: 1, char: "*", canOpen: false, canClose: false },
        ];
        processEmphasis(nodes, delims);
        expect(nodes.length).toBe(3);
        expect(nodes).toEqual([
            { type: "text", value: "*" },
            { type: "text", value: "something" },
            { type: "text", value: "*" },
        ]);
    });

    test("handles nested emphasis with multiple pairs of delimiters", () => {
        const nodes: MarkdownNode[] = [
            { type: "text", value: "Hello " },
            { type: "text", value: "*" },
            { type: "text", value: "world" },
            { type: "text", value: "*" },
            { type: "text", value: " and " },
            { type: "text", value: "**" },
            { type: "text", value: "beyond" },
            { type: "text", value: "**" },
        ];
        const delims = [
            { idx: 1, length: 1, char: "*", canOpen: true, canClose: false },
            { idx: 3, length: 1, char: "*", canOpen: false, canClose: true },
            { idx: 5, length: 2, char: "*", canOpen: true, canClose: false },
            { idx: 7, length: 2, char: "*", canOpen: false, canClose: true },
        ];
        processEmphasis(nodes, delims);
        expect(nodes.length).toBe(4);
        expect(nodes[0]).toEqual({ type: "text", value: "Hello " });
        expect(nodes[1].type).toBe("emphasis");
        if (nodes[1].type === "emphasis") {
            expect(nodes[1].children).toEqual([{ type: "text", value: "world" }]);
        }
        expect(nodes[2]).toEqual({ type: "text", value: " and " });
        expect(nodes[3].type).toBe("strong");
        if (nodes[3].type === "strong") {
            expect(nodes[3].children).toEqual([{ type: "text", value: "beyond" }]);
        }
    });

    test("ignores leftover or unpaired delimiters", () => {
        const nodes: MarkdownNode[] = [
            { type: "text", value: "*" },
            { type: "text", value: "Hello" },
        ];
        const delims = [
            { idx: 0, length: 1, char: "*", canOpen: true, canClose: false },
        ];
        processEmphasis(nodes, delims);
        expect(nodes).toEqual([
            { type: "text", value: "*" },
            { type: "text", value: "Hello" },
        ]);
    });
});