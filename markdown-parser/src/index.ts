/**
 *  markdown-parser/src/index.ts
 *
 *  A revised single-file markdown parser that type-checks cleanly.
 */

/////////////////////////////////////////////////////////////////////////////////////
// AST Node Types
/////////////////////////////////////////////////////////////////////////////////////
export type MarkdownNode =
  | DocumentNode
  | ParagraphNode
  | HeadingNode
  | BlockquoteNode
  | ListNode
  | ListItemNode
  | CodeBlockNode
  | ThematicBreakNode
  | HtmlBlockNode
  | TextNode
  | EmphasisNode
  | StrongNode
  | CodeSpanNode
  | LinkNode
  | ImageNode
  | LineBreakNode;

export interface DocumentNode {
  type: "document";
  children: MarkdownNode[];
  refDefinitions: Map<string, RefDefinition>;
}

export interface ParagraphNode {
  type: "paragraph";
  children: MarkdownNode[];
}

export interface HeadingNode {
  type: "heading";
  level: number;
  children: MarkdownNode[];
}

export interface BlockquoteNode {
  type: "blockquote";
  children: MarkdownNode[];
}

export interface ListNode {
  type: "list";
  ordered: boolean;
  start: number | null;
  tight: boolean;
  children: ListItemNode[];
}

export interface ListItemNode {
  type: "list_item";
  children: MarkdownNode[];
}

export interface CodeBlockNode {
  type: "code_block";
  language?: string;
  value: string;
}

export interface ThematicBreakNode {
  type: "thematic_break";
}

export interface HtmlBlockNode {
  type: "html_block";
  value: string;
}

export interface TextNode {
  type: "text";
  value: string;
}

export interface EmphasisNode {
  type: "emphasis";
  children: MarkdownNode[];
}

export interface StrongNode {
  type: "strong";
  children: MarkdownNode[];
}

export interface CodeSpanNode {
  type: "code_span";
  code: string;
}

export interface LinkNode {
  type: "link";
  url: string;       // guaranteed non-empty
  title?: string;    // optional
  children: MarkdownNode[];
}

export interface ImageNode {
  type: "image";
  url: string;       // guaranteed non-empty
  title?: string;    // optional
  alt: string;       // the bracket text
}

export interface LineBreakNode {
  type: "linebreak";
}

export interface RefDefinition {
  label: string;
  url: string;
  title?: string;
}

/////////////////////////////////////////////////////////////////////////////////////
// Main Entry
/////////////////////////////////////////////////////////////////////////////////////
export function parseMarkdown(markdown: string): string {
  const doc = blockParseToAst(markdown);
  applyInlineParsing(doc);
  return renderAstToHtml(doc);
}

/////////////////////////////////////////////////////////////////////////////////////
// Block Parsing
/////////////////////////////////////////////////////////////////////////////////////
export function blockParseToAst(markdown: string): DocumentNode {
  const normalized = expandTabsAndNormalizeNewlines(markdown);
  const lines = normalized.split("\n");
  const blocks: MarkdownNode[] = [];
  const refDefinitions = new Map<string, RefDefinition>();

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    // 1) reference def?
    if (isRefDefLine(line)) {
      const def = parseRefDef(line);
      if (def) {
        const normLabel = normalizeLabel(def.label);
        refDefinitions.set(normLabel, {
          label: normLabel,
          url: def.url,
          title: def.title,
        });
      }
      i++;
      continue;
    }
    // 2) blockquote?
    if (isBlockquoteLine(line)) {
      const { node, linesUsed } = parseBlockquote(lines, i);
      blocks.push(node);
      i += linesUsed;
      continue;
    }
    // 3) fenced code?
    if (isFencedCodeStart(line.trim())) {
      const { node, linesUsed } = parseFencedCode(lines, i);
      blocks.push(node);
      i += linesUsed;
      continue;
    }
    // 4) thematic break?
    if (isThematicBreak(line.trim())) {
      blocks.push({ type: "thematic_break" });
      i++;
      continue;
    }
    // 5) ATX heading?
    if (isAtxHeading(line)) {
      const heading = createAtxHeading(line);
      blocks.push(heading);
      i++;
      continue;
    }
    // 6) list?
    if (isListStart(line.trim())) {
      const { listNode, usedLines } = parseList(lines, i);
      blocks.push(listNode);
      i += usedLines;
      continue;
    }
    // 7) HTML block?
    if (isHtmlBlockStart(line.trim())) {
      const { node, linesUsed } = parseHtmlBlock(lines, i);
      blocks.push(node);
      i += linesUsed;
      continue;
    }
    // 8) indented code?
    if (isIndentedCode(line)) {
      const { codeNode, linesUsed } = parseIndentedCode(lines, i);
      blocks.push(codeNode);
      i += linesUsed;
      continue;
    }
    // 9) paragraph
    const { paragraph, linesUsed } = parseParagraph(lines, i);
    blocks.push(paragraph);
    i += linesUsed;
  }

  return {
    type: "document",
    children: blocks,
    refDefinitions,
  };
}

export function expandTabsAndNormalizeNewlines(md: string): string {
  const replaced = md.replace(/\t/g, "    ");
  return replaced.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

//--------------------------------------
// reference definitions
//--------------------------------------
export function isRefDefLine(line: string): boolean {
  return /^[ ]{0,3}\[[^]+\]:/.test(line);
}

export function parseRefDef(line: string): RefDefinition | null {
  const match = line.match(
    /^[ ]{0,3}\[([^\]]+)\]:\s*(?:<(.*?)>|(\S+))\s*(?:"([^"]*)"|'([^']*)'|\(([^)]*)\))?\s*$/
  );
  if (!match) return null;
  const label = match[1] || "";
  const url = match[2] || match[3] || "";
  const title = match[4] || match[5] || match[6] || undefined;
  return { label, url, title };
}

export function normalizeLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}

//--------------------------------------
// blockquote
//--------------------------------------
export function isBlockquoteLine(line: string): boolean {
  return /^[ ]{0,3}>/.test(line);
}

export function parseBlockquote(lines: string[], start: number) {
  const bqLines: string[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      // blank => lazy continuation
      bqLines.push("");
      i++;
      continue;
    }
    if (!isBlockquoteLine(line)) break;
    const newLine = line.replace(/^[ ]{0,3}>\s?/, "");
    bqLines.push(newLine);
    i++;
  }
  const subDoc = blockParseToAst(bqLines.join("\n"));
  return {
    node: { type: "blockquote", children: subDoc.children } as BlockquoteNode,
    linesUsed: i - start,
  };
}

//--------------------------------------
// fenced code
//--------------------------------------
export function isFencedCodeStart(line: string): boolean {
  return /^(`{3,}|~{3,})/.test(line);
}

export function parseFencedCode(lines: string[], start: number) {
  const startLine = lines[start].trim();
  const fenceMatch = startLine.match(/^(`{3,}|~{3,})(.*)$/);
  const fenceChars = fenceMatch ? fenceMatch[1] : "```";
  let fenceLang = "";
  if (fenceMatch && fenceMatch[2]) {
    fenceLang = fenceMatch[2].trim();
  }
  const fenceLen = fenceChars.length;
  const fenceChar = fenceChars[0];
  let codeLines: string[] = [];
  let i = start + 1;
  while (i < lines.length) {
    const line = lines[i];
    if (isFencedCodeEnd(line.trim(), fenceChar, fenceLen)) {
      i++;
      break;
    }
    codeLines.push(line);
    i++;
  }
  const node: CodeBlockNode = {
    type: "code_block",
    language: fenceLang || undefined,
    value: codeLines.join("\n"),
  };
  return { node, linesUsed: i - start };
}

export function isFencedCodeEnd(trimmed: string, fenceChar: string, fenceLen: number): boolean {
  const re = new RegExp(`^${fenceChar}{${fenceLen},}\\s*$`);
  return re.test(trimmed);
}

//--------------------------------------
// thematic break
//--------------------------------------
export function isThematicBreak(trimmed: string): boolean {
  return /^(-\s?-\s?-$|(\* ?){3,}|(_ ?){3,})$/.test(trimmed);
}

//--------------------------------------
// atx heading
//--------------------------------------
export function isAtxHeading(line: string): boolean {
  return /^[ ]{0,3}#{1,6}(?:\s|$)/.test(line);
}

export function createAtxHeading(line: string): HeadingNode {
  const m = line.match(/^([ ]{0,3})(#{1,6})\s*(.*?)\s*#*\s*$/);
  if (!m) {
    return { type: "heading", level: 1, children: [{ type: "text", value: line }] };
  }
  const level = m[2].length;
  const content = m[3];
  return {
    type: "heading",
    level,
    children: [{ type: "text", value: content }],
  };
}

//--------------------------------------
// list
//--------------------------------------
export function isListStart(trimmed: string): boolean {
  return /^([-+*]|\d+\.)\s+/.test(trimmed);
}

export function parseList(lines: string[], start: number) {
  const bulletRegex = /^([-+*]|\d+\.)\s+/;
  let i = start;
  const first = lines[i].trim();
  const ordered = /^\d+\./.test(first);
  let startNum: number | null = null;
  if (ordered) {
    const m = first.match(/^(\d+)\./);
    if (m) {
      startNum = parseInt(m[1], 10);
    }
  }
  const items: ListItemNode[] = [];
  let listTight = true;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      listTight = false;
      continue;
    }
    const trimmed = line.trim();
    if (!bulletRegex.test(trimmed)) {
      break;
    }
    const itemContent = trimmed.replace(bulletRegex, "");
    const subDoc = blockParseToAst(itemContent);
    items.push({
      type: "list_item",
      children: subDoc.children,
    });
    i++;
  }
  return {
    listNode: {
      type: "list",
      ordered,
      start: startNum,
      tight: listTight,
      children: items,
    } as ListNode,
    usedLines: i - start,
  };
}

//--------------------------------------
// HTML block
//--------------------------------------
export function isHtmlBlockStart(trimmed: string): boolean {
  return /^<\w+/.test(trimmed) || /^<\/\w+/.test(trimmed) || /^<!--/.test(trimmed);
}

export function parseHtmlBlock(lines: string[], start: number) {
  let htmlLines: string[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      break;
    }
    htmlLines.push(line);
    i++;
  }
  return {
    node: { type: "html_block", value: htmlLines.join("\n") } as HtmlBlockNode,
    linesUsed: i - start,
  };
}

//--------------------------------------
// Indented code
//--------------------------------------
export function isIndentedCode(line: string): boolean {
  return /^( {4,})/.test(line);
}

export function parseIndentedCode(lines: string[], start: number) {
  let codeLines: string[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (!isIndentedCode(line) && line.trim().length !== 0) {
      break;
    }
    codeLines.push(line.replace(/^ {4}/, ""));
    i++;
  }
  return {
    codeNode: {
      type: "code_block",
      value: codeLines.join("\n"),
    } as CodeBlockNode,
    linesUsed: i - start,
  };
}

//--------------------------------------
// paragraph
//--------------------------------------
export function parseParagraph(lines: string[], start: number) {
  let paraLines: string[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) break;
    if (
      isBlockquoteLine(line) ||
      isFencedCodeStart(line.trim()) ||
      isThematicBreak(line.trim()) ||
      isAtxHeading(line) ||
      isListStart(line.trim()) ||
      isHtmlBlockStart(line.trim()) ||
      isIndentedCode(line) ||
      isRefDefLine(line)
    ) {
      break;
    }
    paraLines.push(line);
    i++;
  }
  return {
    paragraph: {
      type: "paragraph",
      children: [{ type: "text", value: paraLines.join("\n") }],
    } as ParagraphNode,
    linesUsed: i - start,
  };
}

/////////////////////////////////////////////////////////////////////////////////////
// Inline Parsing
/////////////////////////////////////////////////////////////////////////////////////
export function applyInlineParsing(node: MarkdownNode): void {
  switch (node.type) {
    case "document": {
      node.children.forEach(applyInlineParsing);
      break;
    }
    case "blockquote": {
      node.children.forEach(applyInlineParsing);
      break;
    }
    case "list": {
      node.children.forEach(applyInlineParsing);
      break;
    }
    case "list_item": {
      node.children.forEach(applyInlineParsing);
      break;
    }
    case "paragraph": {
      if (node.children.length === 1 && node.children[0].type === "text") {
        const textNode = node.children[0] as TextNode;
        node.children = parseInlineString(
          textNode.value,
          new Map<string, RefDefinition>()
        );
      } else {
        node.children.forEach(applyInlineParsing);
      }
      break;
    }
    case "heading": {
      if (node.children.length === 1 && node.children[0].type === "text") {
        const textNode = node.children[0] as TextNode;
        node.children = parseInlineString(
          textNode.value,
          new Map<string, RefDefinition>()
        );
      } else {
        node.children.forEach(applyInlineParsing);
      }
      break;
    }
    // code_block, thematic_break, html_block => do nothing
    default:
      break;
  }
}

/////////////////////////////////////////////////////////////////////////////////////
// Inline Token Type
/////////////////////////////////////////////////////////////////////////////////////
interface InlineToken {
  type:
  | "text"
  | "code_span"
  | "strong"
  | "em"
  | "link"
  | "image"
  | "autolink"
  | "raw_html"
  | "linebreak";
  content: string; // For images we'll store "" or alt text
  raw?: string;    // Original substring
  url?: string;
  title?: string;
  alt?: string;
  isReference?: boolean;
  refLabel?: string;
}

export function parseInlineString(input: string, refMap: Map<string, RefDefinition>): MarkdownNode[] {
  const tokens = tokenizeInlines(input);
  const out: MarkdownNode[] = [];
  for (const tk of tokens) {
    switch (tk.type) {
      case "text":
        out.push({ type: "text", value: tk.content });
        break;
      case "linebreak":
        out.push({ type: "linebreak" });
        break;
      case "code_span":
        out.push({ type: "code_span", code: tk.content });
        break;
      case "strong":
        out.push({
          type: "strong",
          children: parseInlineString(tk.content, refMap),
        });
        break;
      case "em":
        out.push({
          type: "emphasis",
          children: parseInlineString(tk.content, refMap),
        });
        break;
      case "autolink":
        out.push({
          type: "link",
          url: tk.content, // autolink URL is tk.content
          children: [{ type: "text", value: tk.content }],
        });
        break;
      case "raw_html":
        // We'll just treat it as text
        out.push({ type: "text", value: tk.content });
        break;
      case "image": {
        // If reference style, look up
        let finalUrl = tk.url ?? "";
        let finalTitle = tk.title;
        if (tk.isReference && tk.refLabel) {
          const def = refMap.get(normalizeLabel(tk.refLabel));
          if (def) {
            finalUrl = def.url;
            if (def.title) finalTitle = def.title;
          } else {
            // fallback text
            out.push({ type: "text", value: tk.raw || tk.content });
            continue;
          }
        }
        out.push({
          type: "image",
          url: finalUrl,
          title: finalTitle,
          alt: tk.alt || "",
        });
        break;
      }
      case "link": {
        let finalUrl = tk.url ?? "";
        let finalTitle = tk.title;
        if (tk.isReference && tk.refLabel) {
          const def = refMap.get(normalizeLabel(tk.refLabel));
          if (def) {
            finalUrl = def.url;
            if (def.title) finalTitle = def.title;
          } else {
            // fallback as text
            out.push({ type: "text", value: tk.raw || tk.content });
            continue;
          }
        }
        out.push({
          type: "link",
          url: finalUrl,
          title: finalTitle,
          children: parseInlineString(tk.content, refMap),
        });
        break;
      }
      default:
        out.push({ type: "text", value: tk.content });
        break;
    }
  }
  return out;
}

/////////////////////////////////////////////////////////////////////////////////////
// Tokenizer
/////////////////////////////////////////////////////////////////////////////////////
export function tokenizeInlines(input: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let pos = 0;

  while (pos < input.length) {
    // code spans
    if (input[pos] === "`") {
      let backticks = 1;
      let j = pos + 1;
      while (j < input.length && input[j] === "`") {
        backticks++;
        j++;
      }
      const closer = "`".repeat(backticks);
      let end = input.indexOf(closer, j);
      if (end === -1) {
        // no closer => just text
        tokens.push({ type: "text", content: input[pos], raw: input[pos] });
        pos++;
        continue;
      }
      const codeContent = input.substring(j, end);
      tokens.push({
        type: "code_span",
        content: codeContent,
        raw: input.substring(pos, end + backticks),
      });
      pos = end + backticks;
      continue;
    }

    // line break: 2 spaces + newline or backslash + newline
    if (isLineBreak(input, pos)) {
      tokens.push({ type: "linebreak", content: "" });
      // skip the spaces/backslash + newline
      let skipPos = pos;
      while (
        skipPos < input.length &&
        (input[skipPos] === " " || input[skipPos] === "\\")
      ) {
        skipPos++;
      }
      if (skipPos < input.length && input[skipPos] === "\n") {
        skipPos++;
      }
      pos = skipPos;
      continue;
    }

    // images: ![alt](...) or ![alt][label]
    if (input[pos] === "!" && pos + 1 < input.length && input[pos + 1] === "[") {
      const parsed = parseBracketLinkOrImage(input, pos, true);
      if (parsed) {
        tokens.push(parsed);
        pos += parsed.raw!.length;
        continue;
      }
    }

    // bracket link: [text](...) or [text][label]
    if (input[pos] === "[") {
      const parsed = parseBracketLinkOrImage(input, pos, false);
      if (parsed) {
        tokens.push(parsed);
        pos += parsed.raw!.length;
        continue;
      }
    }

    // autolink or raw html <...>
    if (input[pos] === "<") {
      const maybeAuto = parseAutolink(input, pos);
      if (maybeAuto) {
        tokens.push(maybeAuto);
        pos += maybeAuto.raw!.length;
        continue;
      }
      const maybeHtml = parseRawHtmlTag(input, pos);
      if (maybeHtml) {
        tokens.push(maybeHtml);
        pos += maybeHtml.raw!.length;
        continue;
      }
    }

    // emphasis markers: naive
    if ((input[pos] === "*" || input[pos] === "_") && checkEmStart(input, pos)) {
      const em = parseEmphasisRun(input, pos);
      if (em) {
        tokens.push(em);
        pos += em.raw!.length;
        continue;
      }
    }

    // default => text char
    tokens.push({
      type: "text",
      content: input[pos],
      raw: input[pos],
    });
    pos++;
  }

  // merge adjacent text
  return mergeAdjacentTextTokens(tokens);
}

export function isLineBreak(input: string, pos: number): boolean {
  let tmp = pos;
  let spaceCount = 0;
  let slashCount = 0;
  while (tmp < input.length && (input[tmp] === " " || input[tmp] === "\\")) {
    if (input[tmp] === " ") spaceCount++;
    if (input[tmp] === "\\") slashCount++;
    tmp++;
  }
  if (tmp < input.length && input[tmp] === "\n") {
    if (spaceCount >= 2 || slashCount >= 1) {
      return true;
    }
  }
  return false;
}

export function parseBracketLinkOrImage(
  input: string,
  startPos: number,
  isImg: boolean
): InlineToken | null {
  let rawStr = "";
  const bracketOpen = startPos + (isImg ? 2 : 1); // skip '!' if isImg
  const closing = findCloseBracket(input, bracketOpen, "[", "]");
  if (closing < 0) return null;
  const textInside = input.substring(bracketOpen, closing);
  rawStr += input.substring(startPos, closing + 1);

  const nextChar = input[closing + 1] || "";
  if (nextChar === "(") {
    // inline link: [text](url "title")
    const parenClose = findCloseBracket(input, closing + 1, "(", ")");
    if (parenClose < 0) return null;
    rawStr += input.substring(closing + 1, parenClose + 1);
    const linkContent = input.substring(closing + 2, parenClose);
    const { url, title } = splitLinkDestTitle(linkContent.trim());
    if (isImg) {
      return {
        type: "image",
        content: "", // no text content for images
        alt: textInside,
        url,          // fallback empty if needed
        title,
        isReference: false,
        raw: rawStr,
      };
    } else {
      return {
        type: "link",
        content: textInside,
        url,
        title,
        isReference: false,
        raw: rawStr,
      };
    }
  } else if (nextChar === "[") {
    // reference style [text][label]
    const secondClose = findCloseBracket(input, closing + 1, "[", "]");
    if (secondClose < 0) return null;
    rawStr += input.substring(closing + 1, secondClose + 1);
    const refLbl = input.substring(closing + 2, secondClose);
    const labelUsed = refLbl || textInside;
    if (isImg) {
      return {
        type: "image",
        content: "",  // needed for interface
        alt: textInside,
        refLabel: labelUsed,
        isReference: true,
        raw: rawStr,
      };
    } else {
      return {
        type: "link",
        content: textInside,
        refLabel: labelUsed,
        isReference: true,
        raw: rawStr,
      };
    }
  } else {
    // reference shortcut [label]
    rawStr = input.substring(startPos, closing + 1);
    if (isImg) {
      return {
        type: "image",
        content: "",
        alt: textInside,
        refLabel: textInside,
        isReference: true,
        raw: rawStr,
      };
    } else {
      return {
        type: "link",
        content: textInside,
        refLabel: textInside,
        isReference: true,
        raw: rawStr,
      };
    }
  }
}

export function findCloseBracket(
  input: string,
  start: number,
  openChar: string,
  closeChar: string
): number {
  let depth = 1;
  for (let i = start; i < input.length; i++) {
    if (input[i] === openChar) depth++;
    if (input[i] === closeChar) depth--;
    if (depth === 0) return i;
  }
  return -1;
}

export function splitLinkDestTitle(str: string): { url: string; title?: string } {
  // fallback
  let url = "";
  let title: string | undefined;
  let tmp = str;

  if (tmp.startsWith("<")) {
    const end = tmp.indexOf(">");
    if (end >= 0) {
      url = tmp.substring(1, end).trim();
      tmp = tmp.substring(end + 1).trim();
    } else {
      // unclosed
      url = tmp;
      return { url };
    }
  } else {
    const m = tmp.match(/^(\S+)/);
    if (m) {
      url = m[1];
      tmp = tmp.substring(url.length).trim();
    }
  }
  if (tmp) {
    const t = tmp.match(/^"([^"]*)"|'([^']*)'|\(([^)]*)\)/);
    if (t) {
      title = t[1] || t[2] || t[3];
    }
  }
  return { url, title };
}

// autolink
export function parseAutolink(input: string, startPos: number): InlineToken | null {
  const close = input.indexOf(">", startPos + 1);
  if (close < 0) return null;
  const raw = input.substring(startPos, close + 1);
  const inner = raw.substring(1, raw.length - 1);
  // scheme:// or email
  if (/^([a-zA-Z][a-zA-Z0-9.+-]*):/.test(inner) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inner)) {
    return {
      type: "autolink",
      content: inner,
      raw,
    };
  }
  return null;
}

// raw HTML inline
export function parseRawHtmlTag(input: string, startPos: number): InlineToken | null {
  const close = input.indexOf(">", startPos + 1);
  if (close < 0) return null;
  const raw = input.substring(startPos, close + 1);
  return {
    type: "raw_html",
    content: raw, // store same in content
    raw,
  };
}

// emphasis
export function checkEmStart(input: string, pos: number): boolean {
  // naive
  return true;
}

export function parseEmphasisRun(input: string, startPos: number): InlineToken | null {
  const marker = input[startPos]; // * or _
  let count = 1;
  let j = startPos + 1;
  while (j < input.length && input[j] === marker) {
    count++;
    j++;
  }
  const isStrong = count >= 2;
  const closer = marker.repeat(isStrong ? 2 : 1);
  const contentStart = j;
  const endPos = input.indexOf(closer, contentStart);
  if (endPos < 0) {
    return null;
  }
  const content = input.substring(contentStart, endPos);
  const rawAll = input.substring(startPos, endPos + closer.length);
  return {
    type: isStrong ? "strong" : "em",
    content,
    raw: rawAll,
  };
}

// merge adjacent text
export function mergeAdjacentTextTokens(tokens: InlineToken[]): InlineToken[] {
  const out: InlineToken[] = [];
  for (const tk of tokens) {
    if (tk.type === "text" && out.length && out[out.length - 1].type === "text") {
      out[out.length - 1].content += tk.content;
    } else {
      out.push(tk);
    }
  }
  return out;
}

/////////////////////////////////////////////////////////////////////////////////////
// Rendering
/////////////////////////////////////////////////////////////////////////////////////
export function renderAstToHtml(node: MarkdownNode): string {
  switch (node.type) {
    case "document":
      return node.children.map(renderAstToHtml).join("");
    case "paragraph":
      return `<p>${node.children.map(renderAstToHtml).join("")}</p>`;
    case "heading":
      return `<h${node.level}>${node.children.map(renderAstToHtml).join("")}</h${node.level}>`;
    case "blockquote":
      return `<blockquote>${node.children.map(renderAstToHtml).join("")}</blockquote>`;
    case "list":
      return (node.ordered ? "<ol>" : "<ul>") +
        node.children.map(renderAstToHtml).join("") +
        (node.ordered ? "</ol>" : "</ul>");
    case "list_item":
      return `<li>${node.children.map(renderAstToHtml).join("")}</li>`;
    case "code_block":
      {
        const langAttr = node.language ? ` class="language-${escapeHtmlAttr(node.language)}"` : "";
        const escaped = escapeHtml(node.value);
        return `<pre><code${langAttr}>${escaped}</code></pre>`;
      }
    case "thematic_break":
      return `<hr />`;
    case "html_block":
      return node.value; // raw
    case "text":
      return escapeHtml(node.value);
    case "emphasis":
      return `<em>${node.children.map(renderAstToHtml).join("")}</em>`;
    case "strong":
      return `<strong>${node.children.map(renderAstToHtml).join("")}</strong>`;
    case "code_span":
      return `<code>${escapeHtml(node.code)}</code>`;
    case "link":
      {
        const content = node.children.map(renderAstToHtml).join("");
        const href = escapeHtmlAttr(node.url);
        const t = node.title ? ` title="${escapeHtmlAttr(node.title)}"` : "";
        return `<a href="${href}"${t}>${content}</a>`;
      }
    case "image":
      {
        const src = escapeHtmlAttr(node.url);
        const alt = escapeHtmlAttr(node.alt);
        const t = node.title ? ` title="${escapeHtmlAttr(node.title)}"` : "";
        return `<img src="${src}" alt="${alt}"${t} />`;
      }
    case "linebreak":
      return `<br />`;
    default:
      return "";
  }
}

export function escapeHtml(raw: string): string {
  return raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
export function escapeHtmlAttr(raw: string): string {
  return escapeHtml(raw).replace(/"/g, "&quot;");
}

export const createTextNode = (value: string): TextNode => ({ type: "text", value });
