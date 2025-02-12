import { blockPhase } from "./block-parser";
import { parseInlineString, } from "./inline-parser";
import { renderAstToHtml } from "./renderer";
import type { DocumentNode, MarkdownNode } from "./ast";
import { getParagraphContent } from "./parser-helpers";

export function parseMarkdown(markdown: string): string {
  const doc = parseMarkdownToAst(markdown)
  return renderAstToHtml(doc)
}

export function parseMarkdownToAst(markdown: string): DocumentNode {
  const doc = blockPhase(markdown)
  walkBlockTreeAndParseInlines(doc, doc.refDefinitions)
  return doc
}

export function walkBlockTreeAndParseInlines(root: DocumentNode, refMap: Map<string, RefDefinition>) {
  function recurse(node: MarkdownNode) {
    switch (node.type) {
      case "document":
      case "blockquote":
      case "list_item": {
        for (const c of node.children) recurse(c)
        break
      }
      case "list":
        for (const li of node.children) recurse(li)
        break
      case "paragraph":
      case "heading": {
        let raw = ""
        if (node.type === "paragraph") raw = getParagraphContent(node)
        else raw = node.children.map(ch => (ch.type === "text" ? ch.value : "")).join("")
        const inlines = parseInlineString(raw, refMap)
        node.children = inlines
        break
      }
      case "code_block":
      case "thematic_break":
      case "html_block":
        break
      default:
        break
    }
  }
  for (const c of root.children) recurse(c)
}