import { blockPhase } from "./block-parser";
import { walkBlockTreeAndParseInlines } from "./inline-parser";
import { renderAstToHtml } from "./renderer";
import type { DocumentNode } from "./ast";

export function parseMarkdown(markdown: string): string {
  const doc = parseMarkdownToAst(markdown);
  return renderAstToHtml(doc);
}

export function parseMarkdownToAst(markdown: string): DocumentNode {
  const doc = blockPhase(markdown);
  // Inline pass after block structure is set:
  walkBlockTreeAndParseInlines(doc, doc.refDefinitions);
  return doc;
}
