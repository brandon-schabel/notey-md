import type { CodeBlockNode, DocumentNode, ListItemNode, ListNode, MarkdownNode } from "@/ast";
import { test, describe, expect } from "bun:test";
import { blockPhase, canContainLine, tryOpenNewContainers } from "@/block-parser";
import { createEmptyDocumentNode, createCodeBlockNode, createListNode, createListItemNode} from "./test-helpers";

describe("blockPhase - Code Blocks", () => {
    test("should parse a fenced code block", () => {
        const doc = blockPhase("```\nTest code\n```");
        expect(doc.children.length).toBe(1);
        const codeBlock = doc.children[0] as CodeBlockNode;
        expect(codeBlock.type).toBe("code_block");
        expect(codeBlock.value).toContain("Test code");
    });

    test("List item with blank line then indented code block", () => {
        const input = `- item
        
            code line
        `;
        const doc = blockPhase(input);
        // Expect <ul><li> <p>item</p><code_block>code line</code_block></li></ul>
        expect(doc.children.length).toBe(1);
        const list = doc.children[0] as ListNode;
        expect(list.children.length).toBe(1);
        const li = list.children[0];
        expect(li.children.length).toBe(2); // a paragraph and a code block
        expect(li.children[0].type).toBe("paragraph");
        expect(li.children[1].type).toBe("code_block");
    });
});

describe("canContainLine - Code Blocks", () => {
    const codeBlockNode: CodeBlockNode = {
        type: "code_block",
        value: ""
    };
    test("should return true for code_block lines (they can contain anything)", () => {
        expect(canContainLine(codeBlockNode, "console.log('test');", 0)).toBe(true);
        expect(canContainLine(codeBlockNode, "", 0)).toBe(true);
    });
});

describe("tryOpenNewContainers - Code Blocks", () => {
    test("detects fenced code block start and returns true", () => {
        const doc = createEmptyDocumentNode();
        const stack: MarkdownNode[] = [doc];
        const line = "```typescript";
        const offset = 0;
        const result = tryOpenNewContainers(stack, line, offset);
        expect(result).toBe(true);
        expect(stack.length).toBe(2);
        expect(doc.children.length).toBe(1);
        const codeBlock = doc.children[0] as CodeBlockNode;
        expect(codeBlock.type).toBe("code_block");
        expect(codeBlock.language).toBe("typescript");
        expect(codeBlock.value).toBe("");
    });

      test("detects indented code block (4 spaces) and returns true", () => {
        const doc = createEmptyDocumentNode();
        const stack: MarkdownNode[] = [doc];
        const line = "    console.log('test')";
        const offset = 0;
        const result = tryOpenNewContainers(stack, line, offset);
        expect(result).toBe(true);
        expect(stack.length).toBe(2);
        const codeBlock = doc.children[0] as CodeBlockNode;
        expect(codeBlock.type).toBe("code_block");
        expect(codeBlock.value).toBe("console.log('test')");
    });

    test("adds subsequent lines to existing code_block if it isn't fenced-closed", () => {
        const doc = createEmptyDocumentNode();
        const codeBlock = createCodeBlockNode("initial line");
        doc.children.push(codeBlock);
        const stack: MarkdownNode[] = [doc, codeBlock];
        const line = "    console.log('test')";
        const offset = 0;
        const result = tryOpenNewContainers(stack, line, offset);
        expect(result).toBe(true);
        expect(doc.children.length).toBe(1);
        expect(codeBlock.value).toBe("initial line\nconsole.log('test')");
        expect(stack.length).toBe(2); // still in same code block
    });
}); 