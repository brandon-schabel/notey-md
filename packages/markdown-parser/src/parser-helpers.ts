import type { ParagraphNode } from "./ast";

// Helper functions
export function getParagraphContent(node: ParagraphNode): string {
    return (node as any)._raw || "";
  }
  

  /**
 * Returns a block if the line strictly meets one of the CommonMark HTML block conditions (Types 1–7).
 * Otherwise, returns null so that the line is not treated as an HTML block.
 */
export function tryHtmlBlockOpenStrict(line: string): { content: string } | null {
    // Type 2: HTML comment.
    if (/^<!--(.*?)-->/.test(line)) {
      return { content: line };
    }
    // Type 3: Processing instruction.
    if (/^<\?[^>]*\?>/.test(line)) {
      return { content: line };
    }
    // Type 4: Declaration (e.g. DOCTYPE).
    if (/^<!DOCTYPE\s+[^>]+>/i.test(line)) {
      return { content: line };
    }
    // Type 5: CDATA.
    if (/^<!\[CDATA\[.*?\]\]>/.test(line)) {
      return { content: line };
    }
    // Type 1: Certain block-level tags (script, pre, style, textarea).
    if (/^<(script|pre|style|textarea)\b/i.test(line)) {
      return { content: line };
    }
    // Type 6: Block-level tags (simplified list).
    if (/^<\/?(address|article|aside|base|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|header|hr|html|legend|li|menu|nav|ol|p|section|summary|table|tbody|td|tfoot|th|thead|tr)[\s/>]/i.test(line)) {
      return { content: line };
    }
    return null;
  }
  