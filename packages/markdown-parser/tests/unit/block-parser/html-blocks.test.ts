import type { HtmlBlockNode, MarkdownNode } from "@/ast";
import { test, describe, expect } from "bun:test";
import { canContainLine, tryOpenNewContainers } from "@/block-parser";
import { createEmptyDocumentNode } from "./test-helpers";


describe("canContainLine - HTML Blocks", () => {
    const htmlBlockNode: HtmlBlockNode = {
        type: "html_block",
        value: ""
    };
    test("should return false for an html_block on additional lines", () => {
        expect(canContainLine(htmlBlockNode, "more html", 0)).toBe(false);
        expect(canContainLine(htmlBlockNode, "", 0)).toBe(false);
    });
});

describe("tryOpenNewContainers - HTML Blocks", () => {
    test("detects valid HTML block and returns true", () => {
        const doc = createEmptyDocumentNode();
        const stack: MarkdownNode[] = [doc];
        const line = "<!-- This is a comment -->";
        const offset = 0;
        const result = tryOpenNewContainers(stack, line, offset);
        expect(result).toBe(true);
        expect(stack.length).toBe(1);
        const htmlBlock = doc.children[0] as HtmlBlockNode;
        expect(htmlBlock.type).toBe("html_block");
        expect(htmlBlock.value).toBe("<!-- This is a comment -->");
    });
}); 