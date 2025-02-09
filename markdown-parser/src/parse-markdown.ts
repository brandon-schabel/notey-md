import { blockPhase } from './block-parser';
import { walkBlockTreeAndParseInlines } from './inline-parser';
import { renderAstToHtml } from './renderer';
import type { DocumentNode } from './ast';

/**
 * High-level entry point: parse markdown -> AST -> render to HTML
 */
export function parseMarkdown(markdown: string): string {
  // 1) Build block tree with reference definitions map
  const doc: DocumentNode = blockPhase(markdown);

  // 2) Convert paragraph/headings text into inline AST
  walkBlockTreeAndParseInlines(doc, doc.refDefinitions);

  // 3) Render final AST to HTML
  return renderAstToHtml(doc);
}
