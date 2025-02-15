import type { ListNode, ListItemNode, DocumentNode, MarkdownNode } from "@/ast";
import { test, describe, expect } from "bun:test";
import { blockPhase, canContainLine, tryOpenNewContainers } from "@/block-parser";
import { createEmptyDocumentNode, createListNode, createListItemNode } from "./test-helpers";


describe("blockPhase - Lists", () => {
    test("should parse an unordered list", () => {
        const doc = blockPhase("- Item 1\n- Item 2");
        expect(doc.children.length).toBe(1);
        const list = doc.children[0] as ListNode;
        expect(list.type).toBe("list");
        expect(list.ordered).toBe(false);
        expect(list.children.length).toBe(2);
        expect(list.children[0].type).toBe("list_item");
    });

    test("should parse an ordered list", () => {
        const doc = blockPhase("1. First\n2. Second");
        expect(doc.children.length).toBe(1);
        const list = doc.children[0] as ListNode;
        expect(list.type).toBe("list");
        expect(list.ordered).toBe(true);
        expect(list.children.length).toBe(2);
    });

    test("List item with two paragraphs separated by blank line", () => {
        const input = `- First paragraph in list item
      
        Second paragraph in same item`
        const doc = blockPhase(input);
        // doc should be => <ul><li>  <p>First paragraph...</p><p>Second paragraph...</p>  </li></ul>
        expect(doc.children.length).toBe(1); // only one <ul>
        const list = doc.children[0] as ListNode;
        expect(list.type).toBe("list");
        expect(list.children.length).toBe(1); // one <li>
        const li = list.children[0];
        expect(li.children.length).toBe(2);   // 2 paragraphs
        expect(li.children[0].type).toBe("paragraph");
        expect(li.children[1].type).toBe("paragraph");
    });

    test("Nested list items with blank lines in sub-list", () => {
        const input = `- Outer
          - Inner line one
      
            Inner line two
        `;
        // Should yield <ul><li>Outer<ul><li> <p>Inner line one</p><p>Inner line two</p> </li></ul></li></ul>
        const doc = blockPhase(input);
        expect(doc.children.length).toBe(1);
        const list = doc.children[0] as ListNode;
        expect(list.children.length).toBe(1);
        const li = list.children[0];
        expect(li.children.length).toBe(2);
        expect(li.children[0].type).toBe("paragraph");
        expect(li.children[1].type).toBe("list");
        const innerList = li.children[1] as ListNode;
        expect(innerList.children.length).toBe(1);
        const innerLi = innerList.children[0];
        expect(innerLi.children.length).toBe(2);
        expect(innerLi.children[0].type).toBe("paragraph");
    });
});

describe("canContainLine - Lists", () => {
    const listNode: ListNode = {
        type: "list",
        ordered: false,
        start: null,
        tight: true,
        children: []
    };
    const listItemNode: ListItemNode = {
        type: "list_item",
        children: []
    };

    test("should return true if container is a 'list' or 'list_item', ignoring line content in top-level check", () => {
        expect(canContainLine(listNode, "Some text", 0)).toBe(true);
        expect(canContainLine(listNode, "", 0)).toBe(true);
        expect(canContainLine(listItemNode, "- Another item", 0)).toBe(false);
        expect(canContainLine(listItemNode, "", 0)).toBe(true);
    });

    test("should return false for list_item if line starts with a list marker", () => {
        expect(canContainLine(listItemNode, "- New item", 0)).toBe(false);
        expect(canContainLine(listItemNode, "1. Ordered item", 0)).toBe(false);
    });
});

describe("tryOpenNewContainers - Lists", () => {
    test("detects list item - bullet and returns true", () => {
        const doc = createEmptyDocumentNode();
        const stack: MarkdownNode[] = [doc];
        const line = "- List item text";
        const offset = 0;
        const result = tryOpenNewContainers(stack, line, offset);
        expect(result).toBe(true);
        expect(stack.length).toBe(4);
        const listNode = doc.children[0] as ListNode;
        const listItem = listNode.children[0] as ListItemNode;
        expect(listNode.type).toBe("list");
        expect(listNode.ordered).toBe(false);
        expect(listItem.type).toBe("list_item");
        const paragraph = listItem.children[0] as any;
        expect(paragraph.type).toBe("paragraph");
    });

    test("detects list item - plus bullet", () => {
        const doc = createEmptyDocumentNode();
        const stack: MarkdownNode[] = [doc];
        const line = "+ Another bullet item";
        const offset = 0;
        const result = tryOpenNewContainers(stack, line, offset);
        expect(result).toBe(true);
        expect(stack.length).toBe(4);
        const listNode = doc.children[0] as ListNode;
        expect(listNode.ordered).toBe(false);
        const listItem = listNode.children[0] as ListItemNode;
        expect(listItem.type).toBe("list_item");
    });

    test("detects list item - ordered and returns true", () => {
        const doc = createEmptyDocumentNode();
        const stack: MarkdownNode[] = [doc];
        const line = "2. Another item";
        const offset = 0;
        const result = tryOpenNewContainers(stack, line, offset);
        expect(result).toBe(true);
        expect(stack.length).toBe(4);
        const listNode = doc.children[0] as ListNode;
        expect(listNode.ordered).toBe(true);
        expect(listNode.start).toBe(2);
    });

    test("detects another bullet list item following a bullet list, but with same bullet", () => {
        const doc = createEmptyDocumentNode();
        const list = createListNode(false, 1);
        doc.children.push(list);
        const li = createListItemNode();
        list.children.push(li);
        const stack: MarkdownNode[] = [doc, list, li];
        const line = "- Next bullet item";
        const offset = 0;
        const result = tryOpenNewContainers(stack, line, offset);
        expect(result).toBe(true);
        // We expect it to close the current list item & open a new one in the same list
        expect(stack.length).toBe(4);
        expect(list.children.length).toBe(2);
    });

    test("creates a new list if existing list is of a different type", () => {
        const doc = createEmptyDocumentNode();
        const unorderedList = createListNode(false, 1);
        doc.children.push(unorderedList);
        const li = createListItemNode();
        unorderedList.children.push(li);
        const stack: MarkdownNode[] = [doc, unorderedList, li];
        const line = "1. Start ordered list now";
        const offset = 0;
        const result = tryOpenNewContainers(stack, line, offset);
        expect(result).toBe(true);
        // The old list is closed, new list is created
        expect(doc.children.length).toBe(2);
        expect(doc.children[0].type).toBe("list");
        expect(doc.children[1].type).toBe("list");
        const newList = doc.children[1] as ListNode;
        expect(newList.ordered).toBe(true);
    });
}); 