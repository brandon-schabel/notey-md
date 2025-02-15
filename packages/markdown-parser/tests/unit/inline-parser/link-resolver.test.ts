import type { MarkdownNode, RefDefinition } from "@/ast";
import { linkResolver } from "@/inline-parser";
import { test, describe, expect } from "bun:test";

describe("linkResolver", () => {
    test("returns same array if no references exist", () => {
        const inputNodes: MarkdownNode[] = [
            { type: "text", value: "hello" },
            { type: "text", value: "world" },
        ];
        const refMap = new Map<string, RefDefinition>();
        const result = linkResolver(inputNodes, refMap);
        expect(result).toEqual(inputNodes);
    });

    test("handles empty reference map gracefully", () => {
        const inputNodes: MarkdownNode[] = [
            { type: "text", value: "[example]" },
        ];
        const result = linkResolver(inputNodes, new Map());
        expect(result).toEqual(inputNodes);
    });

    test("does not alter nodes without bracket text even if refMap is non-empty", () => {
        const inputNodes: MarkdownNode[] = [
            { type: "text", value: "hello" },
            { type: "text", value: "world" },
        ];
        const refMap = new Map<string, RefDefinition>();
        refMap.set("example", { label: "example", url: "https://example.com" });
        const result = linkResolver(inputNodes, refMap);
        expect(result).toEqual(inputNodes);
    });

    test("ignores bracket text that doesn't match reference map keys", () => {
        const inputNodes: MarkdownNode[] = [
            { type: "text", value: "[unknown]" },
        ];
        const refMap = new Map<string, RefDefinition>();
        refMap.set("example", { label: "example", url: "https://example.com" });
        const result = linkResolver(inputNodes, refMap);
        expect(result).toEqual(inputNodes);
    });
});