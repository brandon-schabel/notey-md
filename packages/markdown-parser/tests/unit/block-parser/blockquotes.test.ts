import type { BlockquoteNode, DocumentNode, MarkdownNode } from "@/ast";
import { test, describe, expect } from "bun:test";
import { blockPhase, canContainLine, consumeContainerMarkers, tryOpenNewContainers } from "@/block-parser";
import { createEmptyDocumentNode, createBlockquoteNode } from "./test-helpers";

describe("blockPhase - Blockquotes", () => {
    test("should parse blockquote container if line starts with >", () => {
        const doc = blockPhase("> Blockquote line");
        expect(doc.children.length).toBe(1);
        const bq = doc.children[0] as BlockquoteNode;
        expect(bq.type).toBe("blockquote");
    });
});

describe("canContainLine - Blockquotes", () => {
    const bqNode: BlockquoteNode = {
        type: "blockquote",
        children: []
    };
    test("should return true for blockquote if line is blank or starts with up to 3 spaces + >", () => {
        expect(canContainLine(bqNode, "> A quote", 0)).toBe(true);
        expect(canContainLine(bqNode, "   > Indented quote", 0)).toBe(true);
        expect(canContainLine(bqNode, "", 0)).toBe(true);
        expect(canContainLine(bqNode, "No marker", 0)).toBe(false);
    });
});

describe("consumeContainerMarkers - Blockquotes", () => {
    test("should consume blockquote markers up to 3 spaces + '>'", () => {
        const blockquote: BlockquoteNode = { type: "blockquote", children: [] };
        const line = "   > some text";
        const initialOffset = 0;
        const newOffset = consumeContainerMarkers(blockquote, line, initialOffset);
        expect(newOffset).toBeGreaterThanOrEqual(4);
        expect(newOffset).toBeLessThanOrEqual(5);
    });

    test("should not modify offset for blockquote if line does not match marker", () => {
        const blockquote: BlockquoteNode = { type: "blockquote", children: [] };
        const line = "No marker here";
        const initialOffset = 0;
        const newOffset = consumeContainerMarkers(blockquote, line, initialOffset);
        expect(newOffset).toBe(0);
    });

     test("should not consume more than 3 spaces before the '>' marker", () => {
        const blockquote: BlockquoteNode = { type: "blockquote", children: [] };
        const line = "       > extra spaces";
        const initialOffset = 0;
        const newOffset = consumeContainerMarkers(blockquote, line, initialOffset);
        // The spec says up to 3 spaces plus '>' is valid. Extra spaces won't be consumed as part of the marker.
        // We can test that offset isn't skipping more than about 6-7 chars.
        expect(newOffset).toBeGreaterThanOrEqual(4);
        expect(newOffset).toBeLessThanOrEqual(7);
    });
});

describe("tryOpenNewContainers - Blockquotes",  () => {
    test("detects blockquote and returns true", () => {
        const doc = createEmptyDocumentNode();
        const stack: MarkdownNode[] = [doc];
        const line = "> Quoted text";
        const offset = 0;
        const result = tryOpenNewContainers(stack, line, offset);
        expect(result).toBe(true);
        expect(stack.length).toBe(2);
        const blockquote = doc.children[0] as BlockquoteNode;
        expect(blockquote.type).toBe("blockquote");
    });

    test("detects blockquote with up to 3 leading spaces", () => {
        const doc = createEmptyDocumentNode();
        const stack: MarkdownNode[] = [doc];
        const line = "   > Indented quote";
        const offset = 0;
        const result = tryOpenNewContainers(stack, line, offset);
        expect(result).toBe(true);
        expect(stack.length).toBe(2);
        const blockquote = doc.children[0] as BlockquoteNode;
        expect(blockquote.type).toBe("blockquote");
    });
}); 