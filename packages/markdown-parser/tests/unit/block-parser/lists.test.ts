import type { ListNode, ListItemNode, DocumentNode, ParagraphNode, CodeBlockNode, BlockquoteNode, MarkdownNode } from "@/ast";
import { test, describe, expect, beforeEach, beforeAll, afterEach } from "bun:test";
import { blockPhase, canContainLine, tryOpenNewContainers, handleBlankLine } from "@/block-parser";
import { createEmptyDocumentNode, createListNode, createListItemNode } from "./test-helpers";
import { setDebugMode, getDebugLogs } from "@/debug";

const normalizeWhitespace = (str: string) => str.replace(/\s+/g, " ").trim();

describe("blockPhase - List Parsing Issues", () => {
    let doc: DocumentNode;

    beforeAll(() => {
        setDebugMode(true);
    });

    beforeEach(() => {
        doc = createEmptyDocumentNode();
    });

    afterEach(() => {
        const logs = getDebugLogs();
        if (logs.length > 0) {
            console.log("Debug Logs for this test:", logs.join("\n"));
        }
    });

    test("handles list item with multiple paragraphs (example 256)", () => {
        const input = "- one\n\n  two";
        const result = blockPhase(input);
        const list = result.children[0] as ListNode;
        expect(list.type).toBe("list");
        expect(list.ordered).toBe(false);
        expect(list.children.length).toBe(1);
        const li = list.children[0] as ListItemNode;
        expect(li.children.length).toBe(2);
        expect(li.children[0].type).toBe("paragraph");
        expect(normalizeWhitespace((li.children[0] as ParagraphNode)._raw || "")).toBe("one");
        expect(li.children[1].type).toBe("paragraph");
        expect(normalizeWhitespace((li.children[1] as ParagraphNode)._raw || "")).toBe("two");
    });

    test("separates list from following paragraph (example 255)", () => {
        const input = "- one\n\n two";
        const result = blockPhase(input);
        expect(result.children.length).toBe(2);
        const list = result.children[0] as ListNode;
        expect(list.type).toBe("list");
        expect(list.children.length).toBe(1);
        expect((list.children[0] as ListItemNode).children[0].type).toBe("paragraph");
        const para = result.children[1] as ParagraphNode;
        expect(para.type).toBe("paragraph");
        expect(normalizeWhitespace(para._raw || "")).toBe("two");
    });

    test("parses nested list with blockquote (example 259)", () => {
        const input = "   > > 1.  one\n>>\n>>     two";
        const result = blockPhase(input);
        expect(result.children.length).toBe(1);
        const bq1 = result.children[0] as BlockquoteNode;
        expect(bq1.type).toBe("blockquote");
        const bq2 = bq1.children[0] as BlockquoteNode;
        expect(bq2.type).toBe("blockquote");
        const list = bq2.children[0] as ListNode;
        expect(list.ordered).toBe(true);
        const li = list.children[0] as ListItemNode;
        expect(li.children.length).toBe(2);
        expect(li.children[0].type).toBe("paragraph");
        expect(normalizeWhitespace((li.children[0] as ParagraphNode)._raw || "")).toBe("one");
        expect(li.children[1].type).toBe("paragraph");
        expect(normalizeWhitespace((li.children[1] as ParagraphNode)._raw || "")).toBe("two");
    });

    test("handles indented code block in list item (example 270)", () => {
        const input = "- foo\n\n      bar";
        const result = blockPhase(input);
        const list = result.children[0] as ListNode;
        const li = list.children[0] as ListItemNode;
        expect(li.children.length).toBe(2);
        expect(li.children[0].type).toBe("paragraph");
        expect(normalizeWhitespace((li.children[0] as ParagraphNode)._raw || "")).toBe("foo");
        expect(li.children[1].type).toBe("code_block");
        expect((li.children[1] as CodeBlockNode).value).toBe("bar");
    });

    test("parses mixed list markers correctly (example 301)", () => {
        const input = "- foo\n- bar\n+ baz";
        const result = blockPhase(input);
        expect(result.children.length).toBe(2);
        const list1 = result.children[0] as ListNode;
        expect(list1.bulletChar).toBe("-");
        expect(list1.children.length).toBe(2);
        const list2 = result.children[1] as ListNode;
        expect(list2.bulletChar).toBe("+");
        expect(list2.children.length).toBe(1);
    });

    test("handles interrupted list with HTML comment (example 308)", () => {
        const input = "- foo\n- bar\n\n<!-- -->\n\n- baz\n- bim";
        const result = blockPhase(input);
        expect(result.children.length).toBe(3);
        expect(result.children[0].type).toBe("list");
        expect((result.children[0] as ListNode).children.length).toBe(2);
        expect(result.children[1].type).toBe("html_block");
        expect(result.children[2].type).toBe("list");
        expect((result.children[2] as ListNode).children.length).toBe(2);
    });

    test("parses nested lists with proper spacing (example 294)", () => {
        const input = "- foo\n  - bar\n    - baz\n      - boo";
        const result = blockPhase(input);
        const outerList = result.children[0] as ListNode;
        expect(outerList.children.length).toBe(1);
        const li1 = outerList.children[0] as ListItemNode;
        expect(li1.children.length).toBe(2);
        expect(li1.children[0].type).toBe("paragraph");
        const innerList1 = li1.children[1] as ListNode;
        expect(innerList1.children.length).toBe(1);
        const li2 = innerList1.children[0] as ListItemNode;
        expect(li2.children.length).toBe(2);
        const innerList2 = li2.children[1] as ListNode;
        expect(innerList2.children.length).toBe(1);
        const li3 = innerList2.children[0] as ListItemNode;
        expect(li3.children.length).toBe(2);
        const innerList3 = li3.children[1] as ListNode;
        expect(innerList3.children.length).toBe(1);
    });

    // Additional tests for isolating issues
    test("separates list from unindented content (example 255 variant)", () => {
        const input = "- one\n\n two\nthree";
        const result = blockPhase(input);
        expect(result.children.length).toBe(2);
        const list = result.children[0] as ListNode;
        expect(list.children.length).toBe(1);
        const para = result.children[1] as ParagraphNode;
        expect(para.type).toBe("paragraph");
        expect(normalizeWhitespace(para._raw || "")).toBe("two three");
    });

    test("handles loose list with blank lines (example 306)", () => {
        const input = "- foo\n\n- bar\n\n\n- baz";
        const result = blockPhase(input);
        const list = result.children[0] as ListNode;
        expect(list.type).toBe("list");
        expect(list.tight).toBe(false);
        expect(list.children.length).toBe(3);
        expect((list.children[0] as ListItemNode).children[0].type).toBe("paragraph");
        expect((list.children[1] as ListItemNode).children[0].type).toBe("paragraph");
        expect((list.children[2] as ListItemNode).children[0].type).toBe("paragraph");
    });

    test("parses nested lists with mixed content (example 307)", () => {
        const input = "- foo\n  - bar\n    - baz\n\n\n      bim";
        const result = blockPhase(input);
        const outerList = result.children[0] as ListNode;
        expect(outerList.children.length).toBe(1);
        const li1 = outerList.children[0] as ListItemNode;
        expect(li1.children.length).toBe(2);
        const innerList1 = li1.children[1] as ListNode;
        expect(innerList1.children.length).toBe(1);
        const li2 = innerList1.children[0] as ListItemNode;
        expect(li2.children.length).toBe(2);
        const innerList2 = li2.children[1] as ListNode;
        expect(innerList2.children.length).toBe(1);
        const li3 = innerList2.children[0] as ListItemNode;
        expect(li3.children.length).toBe(2);
        expect(li3.children[0].type).toBe("paragraph");
        expect(li3.children[1].type).toBe("paragraph");
    });

    test("handles list with code block and blockquote (example 263)", () => {
        const input = "1.  foo\n\n    ```\n    bar\n    ```\n\n    baz\n\n    > bam";
        const result = blockPhase(input);
        const list = result.children[0] as ListNode;
        expect(list.ordered).toBe(true);
        const li = list.children[0] as ListItemNode;
        expect(li.children.length).toBe(4);
        expect(li.children[0].type).toBe("paragraph");
        expect(li.children[1].type).toBe("code_block");
        expect(li.children[2].type).toBe("paragraph");
        expect(li.children[3].type).toBe("blockquote");
    });
});

describe("canContainLine - Edge Cases", () => {
    const listItem: ListItemNode = { type: "list_item", children: [] };

    test("rejects new list marker within list item (example 255)", () => {
        expect(canContainLine(listItem, "- one", 0)).toBe(false);
        expect(canContainLine(listItem, "1. one", 0)).toBe(false);
        expect(canContainLine(listItem, "  two", 0)).toBe(true);
    });

    test("allows indented content in list item (example 270)", () => {
        expect(canContainLine(listItem, "    code", 0)).toBe(true);
        expect(canContainLine(listItem, "  para", 0)).toBe(true);
    });
});

describe("tryOpenNewContainers - List Transitions", () => {
    test("switches list type when bullet changes (example 301)", () => {
        const doc = createEmptyDocumentNode();
        const list = createListNode(false, null, "-");
        const li = createListItemNode();
        list.children.push(li);
        doc.children.push(list);
        const stack: MarkdownNode[] = [doc, list, li];
        const result = tryOpenNewContainers(stack, "+ baz", 0);
        expect(result).toBe(true);
        expect(doc.children.length).toBe(2);
        expect((doc.children[1] as ListNode).bulletChar).toBe("+");
    });

    test("handles ordered list with different delimiter (example 302)", () => {
        const doc = createEmptyDocumentNode();
        const list = createListNode(true, 1, undefined, ".");
        const li = createListItemNode();
        list.children.push(li);
        doc.children.push(list);
        const stack: MarkdownNode[] = [doc, list, li];
        const result = tryOpenNewContainers(stack, "3) baz", 0);
        expect(result).toBe(true);
        expect(doc.children.length).toBe(2);
        expect((doc.children[1] as ListNode).delimiter).toBe(")");
    });

    test("creates nested list with correct indentation (example 294)", () => {
        const doc = createEmptyDocumentNode();
        const outerList = createListNode(false, null, "-");
        const li1 = createListItemNode();
        outerList.children.push(li1);
        doc.children.push(outerList);
        const stack: MarkdownNode[] = [doc, outerList, li1];
        const result = tryOpenNewContainers(stack, "  - bar", 0);
        expect(result).toBe(true);
        expect(li1.children.length).toBe(1);
        const innerList = li1.children[0] as ListNode;
        expect(innerList.type).toBe("list");
        expect(innerList.children.length).toBe(1);
    });
});

describe("handleBlankLine - List Tightness", () => {
    test("marks list as loose with blank line in item (example 306)", () => {
        const doc = createEmptyDocumentNode();
        const list = createListNode(false, null);
        const li = createListItemNode();
        list.children.push(li);
        doc.children.push(list);
        const stack: MarkdownNode[] = [doc, list, li];
        handleBlankLine(stack, null);
        expect(list.tight).toBe(false);
    });

    test("does not affect tightness if paragraph is open (example 256)", () => {
        const doc = createEmptyDocumentNode();
        const list = createListNode(false, null);
        const li = createListItemNode();
        const para = { type: "paragraph" as const, children: [] as MarkdownNode[] };
        li.children.push(para);
        list.children.push(li);
        doc.children.push(list);
        const stack: MarkdownNode[] = [doc, list, li, para];
        handleBlankLine(stack, null);
        expect(list.tight).toBe(true);
    });
});