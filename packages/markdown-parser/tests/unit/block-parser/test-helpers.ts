import type { DocumentNode, ParagraphNode, BlockquoteNode, CodeBlockNode, ListNode, ListItemNode, HeadingNode, ThematicBreakNode, HtmlBlockNode, RefDefinition } from "@/ast";
import { setParagraphContent } from "@/parser-helpers";

export function createEmptyDocumentNode(): DocumentNode {
    return {
        type: "document",
        children: [],
        refDefinitions: new Map<string, RefDefinition>()
    };
}

export function createParagraphNode(text: string): ParagraphNode {
    const node: ParagraphNode = {
        type: "paragraph",
        children: []
    };
    setParagraphContent(node, text);
    return node;
}

export function createCodeBlockNode(value: string, language?: string): CodeBlockNode {
    return {
        type: "code_block",
        value,
        language
    };
}

export function createHeadingNode(level: number, text: string): HeadingNode {
    return {
        type: "heading",
        level,
        children: [
            {
                type: "text",
                value: text
            }
        ]
    };
}

export function createBlockquoteNode(): BlockquoteNode {
    return {
        type: "blockquote",
        children: []
    };
}

export function createListNode(ordered: boolean, start: number | null): ListNode {
    return {
        type: "list",
        ordered,
        start,
        tight: true,
        children: []
    };
}

export function createListItemNode(): ListItemNode {
    return {
        type: "list_item",
        children: []
    };
}

export function createThematicBreakNode(): ThematicBreakNode {
    return {
        type: "thematic_break"
    };
}
export function createHtmlBlockNode(value: string): HtmlBlockNode {
    return {
        type: "html_block",
        value
    };
} 