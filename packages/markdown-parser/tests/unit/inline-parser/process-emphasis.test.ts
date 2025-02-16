import type { MarkdownNode } from "@/ast";
import { processEmphasis } from "@/inline-parser/parse-inlines-with-delimiter-stack";
import { test, describe, expect } from "bun:test";

describe("processEmphasis", () => {
    test("handles single asterisk emphasis", () => {
        const nodes: MarkdownNode[] = [
            { type: "text", value: "Hello " },
            { type: "text", value: "*" },
            { type: "text", value: "world" },
            { type: "text", value: "*" },
        ];
        const delims = [
            { idx: 1, length: 1, char: "*", canOpen: true, canClose: true },
            { idx: 3, length: 1, char: "*", canOpen: true, canClose: true },
        ];
        processEmphasis(nodes, delims);
        expect(nodes).toEqual([
            { type: "text", value: "Hello " },
            { type: "text", value: "" },
            { type: "emphasis", children: [{ type: "text", value: "world" }] },
            { type: "text", value: "" },
        ]);
    });

    test("handles double asterisk strong emphasis", () => {
        const nodes: MarkdownNode[] = [
            { type: "text", value: "Hello " },
            { type: "text", value: "**" },
            { type: "text", value: "world" },
            { type: "text", value: "**" },
        ];
        const delims = [
            { idx: 1, length: 2, char: "*", canOpen: true, canClose: true },
            { idx: 3, length: 2, char: "*", canOpen: true, canClose: true },
        ];
        processEmphasis(nodes, delims);
        expect(nodes).toEqual([
            { type: "text", value: "Hello " },
            { type: "text", value: "" },
            { type: "strong", children: [{ type: "text", value: "world" }] },
            { type: "text", value: "" },
        ]);
    });

    test("handles triple asterisk strong and emphasis", () => {
        const nodes: MarkdownNode[] = [
            { type: "text", value: "***" },
            { type: "text", value: "hello" },
            { type: "text", value: "***" },
        ];
        const delims = [
            { idx: 0, length: 3, char: "*", canOpen: true, canClose: true },
            { idx: 2, length: 3, char: "*", canOpen: true, canClose: true },
        ];
        processEmphasis(nodes, delims);
        expect(nodes).toEqual([
            { type: "text", value: "*" },
            {
                type: "strong",
                children: [{ type: "emphasis", children: [{ type: "text", value: "hello" }] }],
            },
            { type: "text", value: "*" },
        ]);
    });

    test("handles mismatched delimiters", () => {
        const nodes: MarkdownNode[] = [
            { type: "text", value: "*" },
            { type: "text", value: "hello" },
            { type: "text", value: "_" },
        ];
        const delims = [
            { idx: 0, length: 1, char: "*", canOpen: true, canClose: true },
            { idx: 2, length: 1, char: "_", canOpen: true, canClose: true },
        ];
        processEmphasis(nodes, delims);
        expect(nodes).toEqual([
            { type: "text", value: "*" },
            { type: "text", value: "hello" },
            { type: "text", value: "_" },
        ]);
    });

    test("handles delimiters that cannot open or close", () => {
        const nodes: MarkdownNode[] = [
            { type: "text", value: "*" },
            { type: "text", value: "hello" },
            { type: "text", value: "*" },
        ];
        const delims = [
            { idx: 0, length: 1, char: "*", canOpen: false, canClose: false },
            { idx: 2, length: 1, char: "*", canOpen: false, canClose: false },
        ];
        processEmphasis(nodes, delims);
        expect(nodes).toEqual([
            { type: "text", value: "*" },
            { type: "text", value: "hello" },
            { type: "text", value: "*" },
        ]);
    });

    test("handles nested emphasis", () => {
        const nodes: MarkdownNode[] = [
            { type: "text", value: "*" },
            { type: "text", value: "hello *world* again" },
            { type: "text", value: "*" },
        ];
        const delims = [
            { idx: 0, length: 1, char: "*", canOpen: true, canClose: true },
            { idx: 2, length: 1, char: "*", canOpen: true, canClose: true },
        ];
        processEmphasis(nodes, delims);
        expect(nodes).toEqual([
            { type: "text", value: "" },
            {
                type: "emphasis",
                children: [{ type: "text", value: "hello *world* again" }],
            },
            { type: "text", value: "" },
        ]);
    });

    test("handles emphasis with different lengths", () => {
        const nodes: MarkdownNode[] = [
            { type: "text", value: "***" },
            { type: "text", value: "hello" },
            { type: "text", value: "*" },
        ];
        const delims = [
            { idx: 0, length: 3, char: "*", canOpen: true, canClose: true },
            { idx: 2, length: 1, char: "*", canOpen: true, canClose: true },
        ];
        processEmphasis(nodes, delims);
        expect(nodes).toEqual([
            { type: "text", value: "**" },
            { type: "emphasis", children: [{ type: "text", value: "hello" }] },
            { type: "text", value: "" },
        ]);
    });

    test("handles empty emphasis", () => {
        const nodes: MarkdownNode[] = [
            { type: "text", value: "*" },
            { type: "text", value: "*" },
        ];
        const delims = [
            { idx: 0, length: 1, char: "*", canOpen: true, canClose: true },
            { idx: 1, length: 1, char: "*", canOpen: true, canClose: true },
        ];
        processEmphasis(nodes, delims);
        expect(nodes).toEqual([
            { type: "text", value: "" },
            { type: "text", value: "" },
        ]);
    });

    test("handles multiple emphasis blocks", () => {
        const nodes: MarkdownNode[] = [
            { type: "text", value: "*hello* *world*" },
        ];
        const delims = [
            { idx: 0, length: 1, char: "*", canOpen: true, canClose: true },
        ];
        processEmphasis(nodes, delims);
        expect(nodes).toEqual([
            { type: "text", value: "*hello* *world*" },
        ]);
    });

    test("handles emphasis with closer before opener", () => {
        const nodes: MarkdownNode[] = [
            { type: "text", value: "world*" },
            { type: "text", value: "*hello" },
        ];
        const delims = [
            { idx: 0, length: 1, char: "*", canOpen: true, canClose: true },
            { idx: 1, length: 1, char: "*", canOpen: true, canClose: true },
        ];
        processEmphasis(nodes, delims);
        expect(nodes).toEqual([
            { type: "text", value: "world*" },
            { type: "text", value: "*hello" },
        ]);
    });

    test("handles complex nested and overlapping emphasis", () => {
        const nodes: MarkdownNode[] = [
            { type: "text", value: "***a**b*" },
        ];
        const delims = [
            { idx: 0, length: 3, char: "*", canOpen: true, canClose: true },
        ];
        processEmphasis(nodes, delims);
        expect(nodes).toEqual([
            { type: "text", value: "***a**b*" },
        ]);
    });

    test("handles emphasis with empty text nodes", () => {
        const nodes: MarkdownNode[] = [
            { type: "text", value: "" },
            { type: "text", value: "*" },
            { type: "text", value: "" },
            { type: "text", value: "*" },
            { type: "text", value: "" }
        ];
        const delims = [
            { idx: 1, length: 1, char: "*", canOpen: true, canClose: true },
            { idx: 3, length: 1, char: "*", canOpen: true, canClose: true },
        ];
        processEmphasis(nodes, delims);
        expect(nodes).toEqual([
            { type: "text", value: "" },
            { type: "text", value: "" },
            { type: "emphasis", children: [ { type: 'text', value: '' } ] },
            { type: "text", value: "" },
            { type: "text", value: "" }
        ]);
    });
});