import type { CodeBlockNode, RefDefinition, ParagraphNode } from "./ast";

export function getParagraphContent(node: ParagraphNode) {
  return node._raw || "";
}

export function setParagraphContent(node: ParagraphNode, text: string) {
  node._raw = text;
}

export function appendContentToCode(block: CodeBlockNode, line: string) {
  block.value = block.value ? block.value + "\n" + line : line;
}

export function normalizeRefLabel(str: string) {
  return str.trim().toLowerCase().replace(/\s+/g, " ");
}

export function parseRefDefLine(line: string): RefDefinition | null {
  const re =
    /^[ ]{0,3}\[([^\]]+)\]:\s*(?:<(.*?)>|(\S+))\s*(?:"([^"]*)"|'([^']*)'|\(([^)]*)\))?\s*$/;
  const m = line.match(re);
  if (!m) return null;
  const label = m[1] || "";
  const url = m[2] || m[3] || "";
  const title = m[4] || m[5] || m[6] || undefined;
  return { label, url, title };
}

/**
 * Tries to determine whether the given trimmed line should open a strict HTML block.
 */
export function tryHtmlBlockOpenStrict(line: string): { content: string } | null {
  if (/^<!--(.*?)-->/.test(line)) return { content: line };
  if (/^<\?[^>]*\?>/.test(line)) return { content: line };
  if (/^<!DOCTYPE\s+[^>]+>/i.test(line)) return { content: line };
  if (/^<!\[CDATA\[.*?\]\]>/.test(line)) return { content: line };
  if (/^<(script|pre|style|textarea)\b/i.test(line)) return { content: line };
  if (
    /^<\/?(address|article|aside|base|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|header|hr|html|legend|li|menu|nav|ol|p|section|summary|table|tbody|td|tfoot|th|thead|tr)[\s/>]/i.test(
      line,
    )
  ) {
    return { content: line };
  }
  return null;
}
