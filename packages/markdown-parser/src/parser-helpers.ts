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
  // Updated regex to handle cases with no space before title
  const re = /^[ ]{0,3}\[([^\]]*)\]:\s*(?:<(.*?)>|(\S+?))(?:\s*(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?\s*$/;
  const m = line.match(re);
  if (!m) {
    // Handle case where there's no space before title
    const noSpaceRe = /^[ ]{0,3}\[([^\]]*)\]:\s*(?:<(.*?)>|(\S+))(?:"([^"]*)"|(?:'([^']*)')|\(([^)]*)\))\s*$/;
    const mNoSpace = line.match(noSpaceRe);
    if (!mNoSpace) return null;

    const label = mNoSpace[1] || "";
    const url = mNoSpace[2] || mNoSpace[3] || "";
    const title = mNoSpace[4] || mNoSpace[5] || mNoSpace[6] || undefined;
    return { label, url, title };
  }

  const label = m[1] || "";
  const url = m[2] || m[3] || "";
  const title = m[4] || m[5] || m[6] || undefined;
  return { label, url, title };
}

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

export function parseListLine(line: string): {
  ordered: boolean;
  start: number;
  bulletChar?: string;
  delimiter?: "." | ")";
  content: string;
} | null {
  const bulletRe = /^[ ]{0,3}([*+\-])([ \t]+)(.*)$/;
  const mBullet = line.match(bulletRe);
  if (mBullet) {
    return {
      ordered: false,
      start: 1,
      bulletChar: mBullet[1],
      content: mBullet[3] || "",
    };
  }

  const ordRe = /^[ ]{0,3}(\d{1,9})([.)])([ \t]+)(.*)$/;
  const mOrd = line.match(ordRe);
  if (mOrd) {
    let n = parseInt(mOrd[1], 10);
    if (isNaN(n)) n = 1;
    return {
      ordered: true,
      start: n,
      delimiter: mOrd[2] as "." | ")",
      content: mOrd[4] || "",
    };
  }

  return null;
}