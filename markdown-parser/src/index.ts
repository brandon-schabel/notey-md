/* markdown-parser/src/index.ts
 *
 * Revised CommonMark-ish parser with improved block parsing (container stack),
 * emphasis (delimiter stack), reference detection, etc.
 */

////////////////////////////////////
//       AST Node Definitions     //
////////////////////////////////////

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
  | LineBreakNode
  | RawHtmlNode;

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
  spread?: boolean; // for loose/tight determination
}

export interface CodeBlockNode {
  type: "code_block";
  language?: string;
  value: string; // exact literal text
  fence?: string; // store the fence marker for later closing checks
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
  url: string;
  title?: string;
  children: MarkdownNode[];
}

export interface ImageNode {
  type: "image";
  url: string;
  title?: string;
  alt: string;
}

export interface LineBreakNode {
  type: "linebreak";
}

export interface RawHtmlNode {
  type: "raw_html";
  content: string;
}

export interface RefDefinition {
  label: string;
  url: string;
  title?: string;
}


///////////////////////////////////////////////
//        Main Exported Parse Function      //
///////////////////////////////////////////////

/** High-level entry point: parse markdown -> AST -> render to HTML  */
export function parseMarkdown(markdown: string): string {
  // 1) Build block tree
  const doc = blockPhase(markdown);

  // 2) Convert paragraph/headings text into inline AST
  walkBlockTreeAndParseInlines(doc, doc.refDefinitions);

  // 3) Render final AST to HTML
  return renderAstToHtml(doc);
}


////////////////////////////////////////////////////
//          Block Parsing (Phase 1)               //
////////////////////////////////////////////////////

/**
 * Creates the DocumentNode, parsing block structure line-by-line
 * with a container stack approach.
 */
export function blockPhase(markdown: string): DocumentNode {
  // Normalize newlines
  let content = markdown.replace(/\r\n?/g, "\n");

  // Split lines
  const lines = content.split("\n");

  const doc: DocumentNode = {
    type: "document",
    children: [],
    refDefinitions: new Map(),
  };

  // A stack of open container blocks, from outermost to innermost
  let stack: MarkdownNode[] = [doc];

  // Keep track of the lines of text for the paragraph or code block
  // in whichever container is open.
  let lastLineBlank = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // NEW: If the top container is a fenced code block, check for a closing fence
    const top = stack[stack.length - 1];
    if (top.type === "code_block" && (top as CodeBlockNode).fence) {
      const trimmed = line.trim();
      // Create a regex to match a closing fence: up to 3 spaces then a fence with at least as many markers
      const fence = (top as CodeBlockNode).fence!;
      const fenceRegex = new RegExp(`^ {0,3}(${fence}{${fence.length},})\\s*$`);
      if (fenceRegex.test(line)) {
        // We found a closing fence; pop the code block.
        closeBlock(stack, doc.refDefinitions);
        continue; // Skip further processing of this line.
      } else {
        // Otherwise, append the line to the code block's content.
        (top as CodeBlockNode).value += (top.value ? "\n" : "") + line;
        continue;
      }
    }

    let nextLine = lines[i + 1] || null;

    // Attempt to match the existing open container blocks from top to bottom -- close as needed.
    let currentIdx = 1; // skip doc at index 0
    let offset = 0;
    while (currentIdx < stack.length) {
      let container = stack[currentIdx];
      if (!canContainLine(container, line)) {
        // close containers from the top down
        while (stack.length > currentIdx) {
          closeBlock(stack, doc.refDefinitions);
        }
        break;
      }
      // If we matched, possibly consume markers
      offset = consumeContainerMarkers(container, line, offset);
      currentIdx++;
    }

    // Try to open new containers
    let newContainersOpened = tryOpenNewContainers(stack, line, offset);

    if (!newContainersOpened) {
      // If no container was opened, then either process blank or add text.
      if (!line.trim()) {
        if (stack[stack.length - 1].type === "paragraph") {
          closeBlock(stack, doc.refDefinitions);
        }
        continue;
      }
      // If the current container is not already a paragraph or code block, open a new paragraph.
      let top = stack[stack.length - 1];
      if (top.type !== "paragraph" && top.type !== "code_block") {
        const p: ParagraphNode = { type: "paragraph", children: [] };
        addChild(top, p);
        stack.push(p);
      }
      // Append the current (nonblank) line's text to the paragraph.
      if (stack[stack.length - 1].type === "paragraph") {
        let para = stack[stack.length - 1] as ParagraphNode;
        let currentText = getParagraphContent(para);
        setParagraphContent(para, currentText ? currentText + "\n" + line : line);
      }
      continue;
    }

    // Handle blank lines if needed.
    if (!line.trim()) {
      handleBlankLine(stack, doc.refDefinitions);
    }

    lastLineBlank = !line.trim();
  }

  // Close any remaining open blocks.
  while (stack.length > 0) {
    closeBlock(stack, doc.refDefinitions);
  }

  return doc;
}


/**
 * Decide if we can continue the container block with the given line.
 */
export function canContainLine(container: MarkdownNode, line: string): boolean {
  // 'document' always continues
  if (container.type === "document") {
    return true;
  }
  // blockquote => line must match /^ *>/ or be blank for lazy continuation
  if (container.type === "blockquote") {
    // If line is blank or starts with optional up to 3 spaces + '>'
    if (/^[ ]{0,3}>/.test(line) || !line.trim()) {
      return true;
    }
    return false;
  }
  // list_item => we can continue if the line is not blank or if we can do lazy continuation
  // but to keep it simpler, we let the list or sub-block check
  if (container.type === "list_item") {
    // We'll let the parent list decide. The container is a child of a list, so we do partial check:
    return true;
  }
  if (container.type === "list") {
    // The line might be part of the last list item or might start a new item. We'll handle it in tryOpenNewContainers
    // We just say 'true' so we don't forcibly close. We'll see if we open new containers or not
    return true;
  }
  // code_block => continues unless we see a fence close
  if (container.type === "code_block") {
    // If it's fenced, we might see a close fence. We'll check that after.
    // If it's indented code, we continue unless a blank line or lesser indent. Actually let's let offset logic handle it.
    return true;
  }
  if (container.type === "paragraph") {
    // continues if line is non-blank
    if (line.trim()) {
      return true;
    }
    return false;
  }
  // heading => once started is done if next line is not blank? Usually headings are single line
  if (container.type === "heading") {
    // Typically we treat headings as single-line blocks. So we close them once the line is processed.
    return false;
  }

  // thematic_break or html_block => typically single line
  if (container.type === "thematic_break" || container.type === "html_block") {
    return false;
  }

  return false;
}

/**
 * Attempt to consume container markers for an existing container.
 * For example, a blockquote marker, list marker, code indent, etc.
 * Return the new offset (how many chars we've consumed from line).
 */
export function consumeContainerMarkers(container: MarkdownNode, line: string, offset: number): number {
  // blockquote => consume up to 3 spaces + '>' + optional space
  if (container.type === "blockquote") {
    let match = line.slice(offset).match(/^[ ]{0,3}>( ?)?/);
    if (match) {
      offset += match[0].length;
    }
  }
  // if code block is fenced, we do nothing, just let it continue
  // if list, we might do partial. We'll rely on next step
  return offset;
}

/**
 * Attempt to open new containers from the last matched container.
 * Return true if we opened anything.
 */
export function tryOpenNewContainers(stack: MarkdownNode[], line: string, offset: number): boolean {
  let container = stack[stack.length - 1];
  let rest = line.slice(offset);

  // NEW: If the current container is a paragraph, check for a setext heading underline.
  if (container.type === "paragraph") {
    const setext = rest.match(/^[ ]{0,3}(=+|-+)\s*$/);
    if (setext) {
      const para = container as ParagraphNode;
      const paraText = getParagraphContent(para);
      if (paraText.trim() !== "") {
        const level = setext[1].startsWith("=") ? 1 : 2;
        // Remove the paragraph from the stack and its parent.
        stack.pop();
        const parent = stack[stack.length - 1];
        removeNodeChild(parent, para);
        const heading: HeadingNode = {
          type: "heading",
          level,
          children: [{ type: "text", value: paraText }],
        };
        addChild(parent, heading);
        return true;
      }
    }
  }

  // Then, check for thematic break (if not handled as setext heading).
  if (isThematicBreak(rest)) {
    closeParagraphIfOpen(stack);
    const hr: ThematicBreakNode = { type: "thematic_break" };
    addChild(stack[stack.length - 1], hr);
    return true;
  }

  // ATX heading?
  let atx = parseAtxHeading(rest);
  if (atx) {
    closeParagraphIfOpen(stack);
    addChild(stack[stack.length - 1], atx);
    return true;
  }

  // Fenced code block start?
  if (isFencedCodeStart(rest.trim())) {
    closeParagraphIfOpen(stack);
    let match = rest.trim().match(/^(`{3,}|~{3,})(.*)$/);
    if (match) {
      let fence = match[1];
      let info = match[2] ? match[2].trim() : "";
      let node: CodeBlockNode = {
        type: "code_block",
        language: info || undefined,
        value: "",
        fence: fence, // store the fence marker for later closing checks
      };
      addChild(stack[stack.length - 1], node);
      stack.push(node);
      return true;
    }
  }

  // Blockquote?
  let bqMatch = rest.match(/^[ ]{0,3}>( ?)?/);
  if (bqMatch) {
    if (container.type !== "blockquote") {
      closeParagraphIfOpen(stack);
      let bq: BlockquoteNode = { type: "blockquote", children: [] };
      addChild(stack[stack.length - 1], bq);
      stack.push(bq);
    }
    return true;
  }

  // List item?
  let listMatch = getListMarker(rest);
  if (listMatch) {
    closeParagraphIfOpen(stack);
    // NEW: Close any open list_item so that a new one will be started.
    while (stack.length && stack[stack.length - 1].type === "list_item") {
      closeBlock(stack, null);
    }
    let top = stack[stack.length - 1];
    const wantOrdered = listMatch.ordered;
    const wantStart = listMatch.start;
    let parentList: ListNode | null = null;
    if (top.type === "list") {
      if (top.ordered === wantOrdered) {
        parentList = top as ListNode;
      } else {
        while (stack.length && stack[stack.length - 1].type !== "document") {
          let t = stack[stack.length - 1];
          if (t.type === "list") {
            closeBlock(stack, null);
            break;
          } else {
            closeBlock(stack, null);
          }
        }
      }
    }
    if (!parentList) {
      let newList: ListNode = {
        type: "list",
        ordered: wantOrdered,
        start: wantOrdered ? wantStart : null,
        tight: true,
        children: [],
      };
      addChild(stack[stack.length - 1], newList);
      stack.push(newList);
      parentList = newList;
    }
    let li: ListItemNode = { type: "list_item", children: [] };
    addChild(parentList, li);
    stack.push(li);
    // Open a new paragraph inside the list item.
    let p: ParagraphNode = { type: "paragraph", children: [] };
    addChild(li, p);
    stack.push(p);
    return true;
  }

  // Indented code block? (4 spaces)
  // but only if we are not in a container that takes text
  if (!rest.trim()) {
    // blank => not an indented code start
  } else {
    let indentMatch = line.match(/^ {4,}(.*)$/);
    if (indentMatch) {
      // close paragraph if any
      closeParagraphIfOpen(stack);

      let codeLine = indentMatch[1];
      let top = stack[stack.length - 1];
      if (top.type === "code_block" && !hasFencedEnding(top.value)) {
        // just continue
        appendContentToCode(top, codeLine);
      } else {
        // new code block
        let cb: CodeBlockNode = {
          type: "code_block",
          value: codeLine,
        };
        addChild(stack[stack.length - 1], cb);
        stack.push(cb);
      }
      return true;
    }
  }

  // HTML block? Use a stricter check that only matches valid HTML blocks.
  let maybeHtmlBlock = tryHtmlBlockOpenStrict(rest.trim());
  if (maybeHtmlBlock) {
    closeParagraphIfOpen(stack);
    const block: HtmlBlockNode = { type: "html_block", value: maybeHtmlBlock.content };
    addChild(stack[stack.length - 1], block);
    return true;
  }

  // not matched anything new
  return false;
}

/**
 * If the top of the stack is a paragraph, close it
 * (useful if we want to start a new container).
 */
export function closeParagraphIfOpen(stack: MarkdownNode[]) {
  let top = stack[stack.length - 1];
  if (top.type === "paragraph") {
    closeBlock(stack, null);
  }
}

/** 
 * Handle a blank line in the container stack context.
 * CommonMark rules say blank lines can close paragraphs, but not necessarily block quotes or lists if lazy continuation.
*/
export function handleBlankLine(stack: MarkdownNode[], refMap: Map<string, RefDefinition>) {
  let top = stack[stack.length - 1];
  if (top.type === "paragraph") {
    // close it
    closeBlock(stack, refMap);
  } else if (top.type === "list_item") {
    // might indicate a new item or might be space
    // We'll see. We'll keep it as a blank line, might indicate loose list
    // We'll do partial approach: let it remain
  } else if (top.type === "code_block") {
    // code block keeps blank lines
    appendContentToCode(top, "");
  } else {
    // do nothing
  }
}

/**
 * Called when we finish a block (e.g. we see a blank line or a new container).
 * This finalizes the block. If it is a paragraph, we check if it is purely
 * reference definitions. If so, we store them in refMap and remove the paragraph.
 */
export function closeBlock(stack: MarkdownNode[], refMap: Map<string, RefDefinition> | null) {
  let block = stack.pop();
  if (!block) return;

  if (block.type === "paragraph" && refMap) {
    let text = getParagraphContent(block).trim();
    let lines = text.split("\n");
    let leftover: string[] = [];
    for (let line of lines) {
      let def = parseRefDefLine(line);
      if (def) {
        let normLabel = normalizeRefLabel(def.label);
        if (!refMap.has(normLabel)) {
          refMap.set(normLabel, { label: normLabel, url: def.url, title: def.title });
        }
      } else {
        leftover.push(line);
      }
    }
    // If leftover is empty, remove this paragraph from the AST.
    if (leftover.length === 0) {
      let parent = stack[stack.length - 1];
      removeNodeChild(parent, block);
    } else {
      setParagraphContent(block, leftover.join("\n"));
    }
  }

  // if code_block is fenced, check if last line might close fence?
}

/** Minimal check if fenced code block has a closer. We skip for brevity. */
export function hasFencedEnding(value: string): boolean {
  // we do partial approach
  return false;
}

/**
 * Returns true if the given line indicates the start of a fenced code block.
 * A fenced code block starts with at least three backticks (```) or tildes (~~~).
 */
export function isFencedCodeStart(line: string): boolean {
  return /^(`{3,}|~{3,})/.test(line);
}

export function parseAtxHeading(line: string): HeadingNode | null {
  let re = /^(#{1,6})(?:[ \t]+|$)(.*?)(?:[ \t]+#+[ \t]*|[ \t]*)$/;
  let m = line.match(re);
  if (!m) return null;
  let rawHashes = m[1];
  let text = m[2] || "";
  let level = rawHashes.length;
  let node: HeadingNode = {
    type: "heading",
    level,
    children: [{ type: "text", value: text }],
  };
  return node;
}

export function isThematicBreak(line: string): boolean {
  // must have 3+ of `* - _`, ignoring spaces
  let t = line.trim().replace(/\s+/g, "");
  if (/^(?:\*{3,}|-{3,}|_{3,})$/.test(t)) {
    return true;
  }
  return false;
}

/**
 * Return {ordered:boolean, start:number, bulletChar?:string} or null
 */
export function getListMarker(line: string): { ordered: boolean; start: number; bulletChar?: string } | null {
  // match bullet or ordered
  // bullet: /^[*-+] (some text)
  // ordered: ^(\d+)([.)]) (some text)
  let bulletRe = /^[ ]{0,3}([*+\-])(\s+)(.*)$/;
  let m = line.match(bulletRe);
  if (m) {
    return { ordered: false, start: 1, bulletChar: m[1] };
  }

  let ordRe = /^[ ]{0,3}(\d{1,9})([.)])(\s+)(.*)$/;
  let m2 = line.match(ordRe);
  if (m2) {
    let n = parseInt(m2[1], 10);
    if (isNaN(n)) n = 1;
    return { ordered: true, start: n };
  }

  return null;
}


export function tryHtmlBlockOpen(line: string): { content: string } | null {
  // We do a simplified check: if line starts <tag or <!-- or something. We'll just capture one line raw
  // Real CommonMark has 7 types. We'll do partial:

  if (/^<!--/.test(line)) {
    return { content: line };
  }
  if (/^<\?/.test(line)) {
    return { content: line };
  }
  if (/^<![A-Z]/i.test(line)) {
    return { content: line };
  }
  if (/^<!\[CDATA\[/.test(line)) {
    return { content: line };
  }
  if (/^<[/]?[a-zA-Z][\s>/]/.test(line)) {
    return { content: line };
  }
  return null;
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

export function addChild(parent: MarkdownNode, child: MarkdownNode) {
  if (parent.type === "document") {
    parent.children.push(child);
    return;
  }
  if ("children" in parent) {
    (parent.children as MarkdownNode[]).push(child);
  }
}

export function removeNodeChild(parent: MarkdownNode, child: MarkdownNode) {
  if (parent.type === "document") {
    let idx = parent.children.indexOf(child);
    if (idx !== -1) parent.children.splice(idx, 1);
    return;
  }
  if ("children" in parent) {
    let arr = parent.children as MarkdownNode[];
    let idx = arr.indexOf(child);
    if (idx !== -1) arr.splice(idx, 1);
  }
}

export function isParagraphLike(node: MarkdownNode) {
  return node.type === "paragraph" || node.type === "code_block";
}

export function getParagraphContent(node: ParagraphNode) {
  // we'll store raw text in a hidden property or something
  let t = (node as any)._raw || "";
  return t;
}
export function setParagraphContent(node: ParagraphNode, text: string) {
  (node as any)._raw = text;
}
export function appendContentToCode(node: CodeBlockNode, line: string) {
  if (node.value) {
    node.value += "\n" + line;
  } else {
    node.value = line;
  }
}


////////////////////////////////////////////////////
//   Parsing Reference Definitions in Paragraphs   //
////////////////////////////////////////////////////

export function parseRefDefLine(line: string): RefDefinition | null {
  let re = /^[ ]{0,3}\[([^\]]+)\]:\s*(?:<(.*?)>|(\S+))\s*(?:"([^"]*)"|'([^']*)'|\(([^)]*)\))?\s*$/;
  let m = line.match(re);
  if (!m) return null;
  let label = m[1] || "";
  let url = m[2] || m[3] || "";
  let title = m[4] || m[5] || m[6] || undefined;
  return { label, url, title };
}

export function normalizeRefLabel(str: string): string {
  return str.trim().toLowerCase().replace(/\s+/g, " ");
}


//////////////////////////////////////
//      Phase 2: Inline Parsing     //
//////////////////////////////////////

export function walkBlockTreeAndParseInlines(root: DocumentNode, refMap: Map<string, RefDefinition>) {
  function recurse(node: MarkdownNode) {
    switch (node.type) {
      case "document":
      case "blockquote":
      case "list_item":
        for (let c of (node as any).children) {
          recurse(c);
        }
        break;
      case "list":
        for (let li of node.children) {
          recurse(li);
        }
        break;
      case "paragraph":
      case "heading":
        // gather raw text
        let raw = "";
        if (node.type === "paragraph") {
          raw = getParagraphContent(node);
        } else if (node.type === "heading") {
          // this might be leftover from creation
          raw = node.children.map(ch => (ch.type === "text" ? ch.value : "")).join("");
        }
        // parse inline
        let inlines = parseInlineString(raw, refMap);
        node.children = inlines;
        break;
      case "code_block":
      case "thematic_break":
      case "html_block":
        // do nothing
        break;
      default:
        // no recursion needed
        break;
    }
  }
  for (let c of root.children) {
    recurse(c);
  }
}

/**
 * Parse inline text into a node array.
 * We'll do a 2-phase approach:
 *   1) tokenize
 *   2) build AST with emphasis / links / images via a delimiter stack
 */
export function parseInlineString(input: string, refMap: Map<string, RefDefinition>): MarkdownNode[] {
  // Tokenize
  let tokens = lexInline(input);

  // Build emphasis & code, raw HTML, etc. with a proper delimiter stack
  let nodes = parseInlinesWithDelimiterStack(tokens, refMap);

  // Then handle link references
  // (We do a final pass or we can do linkResolver while building above)
  let resolved = linkResolver(nodes, refMap);

  return resolved;
}

/////////////////////////////////////////
// 1) Lexing: produce an array of tokens
/////////////////////////////////////////

export interface InlineToken {
  type: string;
  content: string;
  raw?: string;
  potential?: boolean;
}

export function lexInline(line: string): InlineToken[] {
  // This is a big area. We'll do partial coverage:
  // We identify backticks, code, stars/underscore runs, bracket runs, raw html, text, etc.

  let tokens: InlineToken[] = [];
  let i = 0;
  while (i < line.length) {
    let c = line[i];
    // backslash?
    if (c === "\\") {
      let next = line[i + 1] || "";
      if (/\n/.test(next)) {
        // line break
        tokens.push({ type: "br", content: "" });
        i += 2;
        continue;
      } else if (/[\`\*\_\[\]\(\)\~\\]/.test(next)) {
        // escapable
        tokens.push({ type: "text", content: next });
        i += 2;
        continue;
      } else {
        // literal backslash
        tokens.push({ type: "text", content: "\\" });
        i++;
        continue;
      }
    }

    // code backticks?
    if (c === "`") {
      // find run length
      let start = i;
      let runLen = 1;
      let j = i + 1;
      while (j < line.length && line[j] === "`") {
        runLen++;
        j++;
      }
      // look for a matching run
      let closer = "`".repeat(runLen);
      let endPos = line.indexOf(closer, j);
      if (endPos === -1) {
        // no match => literal
        tokens.push({ type: "text", content: line.slice(i, j) });
        i = j;
        continue;
      } else {
        // content is between j and endPos
        let codeContent = line.slice(j, endPos);
        // strip one leading/trailing space if not all space
        if (codeContent.length > 0 && codeContent.startsWith(" ") && codeContent.endsWith(" ") && codeContent.trim() !== "") {
          codeContent = codeContent.slice(1, -1);
        }
        tokens.push({ type: "code_span", content: codeContent });
        i = endPos + runLen;
        continue;
      }
    }

    // autolinks or raw HTML if starts with <
    if (c === "<") {
      let auto = matchAutolink(line, i);
      if (auto) {
        tokens.push({ type: "autolink", content: auto.content });
        i += auto.length;
        continue;
      }
      let raw = matchRawInlineHtml(line, i);
      if (raw) {
        // Only treat as raw_html if it qualifies as valid per our strict check;
        // otherwise, use a text token so that it will be escaped.
        if (tryHtmlBlockOpenStrict(raw.content)) {
          tokens.push({ type: "raw_html", content: raw.content });
        } else {
          tokens.push({ type: "text", content: raw.content });
        }
        i += raw.length;
        continue;
      }
      tokens.push({ type: "text", content: "<" });
      i++;
      continue;
    }

    // star/underscore runs?
    if (c === "*" || c === "_") {
      // measure run
      let runStart = i;
      let runChar = c;
      let runCount = 1;
      let k = i + 1;
      while (k < line.length && line[k] === runChar) {
        runCount++;
        k++;
      }
      tokens.push({ type: "delim", content: runChar.repeat(runCount) });
      i = k;
      continue;
    }

    // bracket?
    if (c === "[") {
      tokens.push({ type: "lbracket", content: "[" });
      i++;
      continue;
    }
    if (c === "]") {
      tokens.push({ type: "rbracket", content: "]" });
      i++;
      continue;
    }
    if (c === "(") {
      tokens.push({ type: "lparen", content: "(" });
      i++;
      continue;
    }
    if (c === ")") {
      tokens.push({ type: "rparen", content: ")" });
      i++;
      continue;
    }

    // new line => could be soft break or two spaces => line break
    if (c === "\n") {
      tokens.push({ type: "softbreak", content: "" });
      i++;
      continue;
    }

    // else text
    tokens.push({ type: "text", content: c });
    i++;
  }
  return tokens;
}

export function matchAutolink(str: string, start: number) {
  let sub = str.slice(start);
  // Simple approach: <http://...> or <foo@bar>
  let re = /^<([A-Za-z][A-Za-z0-9+.-]{1,31}:[^<>\s]+|[^\s<>@]+@[^\s<>]+)>/;
  let m = sub.match(re);
  if (!m) return null;
  return { content: m[1], length: m[0].length };
}

export function matchRawInlineHtml(str: string, start: number) {
  // partial approach: <tag ...>, or comment <!-- ... -->
  // We'll do a simpler approach
  let sub = str.slice(start);
  let re = /^<([a-zA-Z\/][^>\n]*)>/;
  let m = sub.match(re);
  if (!m) return null;
  return { content: m[0], length: m[0].length };
}


/////////////////////////////////////////////
// 2) Build AST with emphasis + code spans
/////////////////////////////////////////////

export function parseInlinesWithDelimiterStack(tokens: InlineToken[], refMap: Map<string, RefDefinition>): MarkdownNode[] {
  // We'll accumulate a list of final nodes, building an emphasis & strong emphasis structure
  // using a simplified "delimiter stack" approach

  // First pass: create a partial node list, handling code spans, raw HTML, autolink, br, etc. literally
  // We'll keep "delim" tokens for * and _ runs, which we handle after in emphasis resolution.

  let nodes: MarkdownNode[] = [];
  let delims: { idx: number; length: number; char: string; canOpen: boolean; canClose: boolean }[] = [];

  for (let i = 0; i < tokens.length; i++) {
    let t = tokens[i];
    switch (t.type) {
      case "code_span":
        nodes.push({ type: "code_span", code: t.content });
        break;
      case "raw_html":
        nodes.push({ type: "raw_html", content: t.content });
        break;
      case "autolink": {
        // check if it's email
        let c = t.content;
        let isEmail = /^[^\s@]+@[^\s@]+$/.test(c);
        let url = c;
        if (isEmail) {
          url = "mailto:" + url;
        }
        nodes.push({
          type: "link",
          url,
          children: [{ type: "text", value: t.content }],
        });
        break;
      }
      case "softbreak":
        // for CommonMark we treat as soft line break => we can either do linebreak or space
        nodes.push({ type: "text", value: " " });
        break;
      case "br":
        nodes.push({ type: "linebreak" });
        break;
      case "delim": {
        // store for emphasis pass
        // figure out canOpen/canClose by left-flanking / right-flanking rules
        let runChar = t.content[0]; // * or _
        let runLen = t.content.length;

        let lastChar = i > 0 ? tokens[i - 1].content.slice(-1) : "";
        let nextChar = i < tokens.length - 1 ? tokens[i + 1].content.slice(0, 1) : "";

        let canOpen = isLeftFlankingDelimiterRun(runChar, lastChar, nextChar, runLen);
        let canClose = isRightFlankingDelimiterRun(runChar, lastChar, nextChar, runLen);

        // push a placeholder text node for now
        let textNode: TextNode = { type: "text", value: t.content };
        let nodeIndex = nodes.length;
        nodes.push(textNode);

        delims.push({
          idx: nodeIndex,
          length: runLen,
          char: runChar,
          canOpen,
          canClose,
        });
        break;
      }
      case "text":
        nodes.push({ type: "text", value: t.content });
        break;
      default:
        // bracket tokens, parentheses => we just treat them as text for now
        nodes.push({ type: "text", value: t.content });
        break;
    }
  }

  // now emphasis resolution
  processEmphasis(nodes, delims);

  return nodes;
}

export function isLeftFlankingDelimiterRun(
  delimChar: string,
  lastChar: string | undefined,
  nextChar: string | undefined,
  runLen: number
): boolean {
  // Very simplified check. Real CommonMark has additional rules.
  if (delimChar === "*") {
    // * can do intraword
    // left flanking if next char is not space/punct or if next is punctuation and prev is punctuation
    return !!nextChar && !/\s/.test(nextChar);
  } else {
    // underscore: intraword is disallowed
    if (!nextChar) return false;
    if (/\s/.test(nextChar)) return false;
    // if nextChar is alphanumeric, check lastChar and default to empty string if it is undefined.
    if (/[a-zA-Z0-9]/.test(nextChar)) {
      if (/[a-zA-Z0-9]/.test(lastChar || "")) {
        return false;
      }
    }
    return true;
  }
}

export function isRightFlankingDelimiterRun(
  delimChar: string,
  lastChar: string | undefined,
  nextChar: string | undefined,
  runLen: number
): boolean {
  if (delimChar === "*") {
    return !!lastChar && !/\s/.test(lastChar);
  } else {
    // underscore
    // disallow intraword => if lastChar is alnum and nextChar is alnum => no close
    if (!lastChar) return false;
    if (/[a-zA-Z0-9]/.test(lastChar) && nextChar && /[a-zA-Z0-9]/.test(nextChar)) {
      return false;
    }
    return true;
  }
}

/**
 * Processes emphasis, turning text nodes with * or _ into <em>/<strong>.
 * This is a partial reference to the real CommonMark delimiter approach.
 */
export function processEmphasis(nodes: MarkdownNode[], delims: any[]) {
  // We'll do a naive approach: scan from left to right, find a matching pair
  // with the smallest overlap, form emphasis or strong, remove from array, repeat
  // Real CommonMark has multiple-of-3 logic for mixing * and _ runs. We'll do partial.

  // Sort delim by idx ascending, so we can process in order
  delims.sort((a, b) => a.idx - b.idx);

  let used = new Set<number>();

  for (let closerIdx = delims.length - 1; closerIdx >= 0; closerIdx--) {
    if (used.has(closerIdx)) continue;
    let closer = delims[closerIdx];
    if (!closer.canClose) continue;

    // find an opener
    for (let openerIdx = closerIdx - 1; openerIdx >= 0; openerIdx--) {
      if (used.has(openerIdx)) continue;
      let opener = delims[openerIdx];
      if (!opener.canOpen) continue;
      if (opener.char !== closer.char) continue;

      let combined = opener.length + closer.length;
      let isStrong = opener.length >= 2 && closer.length >= 2;
      let useCount = isStrong ? 2 : 1;

      // transform
      used.add(openerIdx);
      used.add(closerIdx);

      // shrink text in opener, closer
      let openerNode = nodes[opener.idx] as TextNode;
      let closerNode = nodes[closer.idx] as TextNode;
      let openerText = openerNode.value;
      let closerText = closerNode.value;

      // remove used number of delimiters
      openerNode.value = openerText.slice(0, openerText.length - useCount);
      closerNode.value = closerText.slice(useCount);

      // build child array from everything in between
      let start = opener.idx + 1;
      let end = closer.idx - 1;
      if (openerNode.value.length === 0) {
        // remove opener node
        nodes.splice(opener.idx, 1);
        // need to fix indexes
        let shift = opener.idx;
        for (let di = 0; di < delims.length; di++) {
          if (delims[di].idx > shift) {
            delims[di].idx--;
          }
        }
        if (closer.idx > shift) {
          closer.idx--;
        }
        if (end >= shift) {
          end--;
        }
        if (start > 0 && start > shift) {
          start--;
        }
      }
      if (closerNode.value.length === 0) {
        // remove closer node
        nodes.splice(closer.idx, 1);
        let shift = closer.idx;
        for (let di = 0; di < delims.length; di++) {
          if (delims[di].idx > shift) {
            delims[di].idx--;
          }
        }
        if (end >= shift) {
          end--;
        }
      }

      // Now build emphasis node from the in-between
      if (start < 0) start = 0;
      if (end >= nodes.length) end = nodes.length - 1;
      if (start > end) {
        // no content => skip
        continue;
      }
      let content = nodes.slice(start, end + 1);

      // create new node
      let emph: MarkdownNode = isStrong
        ? { type: "strong", children: content }
        : { type: "emphasis", children: content };

      // remove the content from nodes
      nodes.splice(start, end - start + 1, emph);

      // adjust delim indexes
      let removedCount = (end - start);
      for (let di = 0; di < delims.length; di++) {
        let ddd = delims[di];
        if (ddd.idx > start + removedCount) {
          ddd.idx = ddd.idx - removedCount;
        } else if (ddd.idx >= start && ddd.idx <= end) {
          // used up
          used.add(di);
        }
      }

      // done matching
      break;
    }
  }
}


//////////////////////////////////////////////////
//   Link Resolution (final pass inlines)       //
//////////////////////////////////////////////////

export function linkResolver(inlineNodes: MarkdownNode[], refMap: Map<string, RefDefinition>): MarkdownNode[] {
  // We do a pass to convert [foo](url) sequences that remain as literal text. Already handled bracket tokens as text?
  // Actually we handle references for [foo], [foo][] or [foo][bar].
  // But our naive approach: we do not have bracket tokens. We'll do partial approach:
  return inlineNodes;
}


//////////////////////////////////////
//         Rendering to HTML        //
//////////////////////////////////////

export function renderAstToHtml(node: MarkdownNode, isTop = true, idx = 0, count = 1): string {
  switch (node.type) {
    case "document":
      return node.children.map((c, i) => renderAstToHtml(c, true, i, node.children.length)).join("");
    case "paragraph": {
      let inner = node.children.map((c, i) => renderAstToHtml(c, false, i, node.children.length)).join("");
      return wrapBlock(`<p>${inner}</p>`, isTop, idx, count);
    }
    case "heading": {
      let inner = node.children.map((c, i) => renderAstToHtml(c, false, i, node.children.length)).join("");
      return wrapBlock(`<h${node.level}>${inner}</h${node.level}>`, isTop, idx, count);
    }
    case "blockquote": {
      let inner = node.children.map((c, i) => renderAstToHtml(c, false, i, node.children.length)).join("");
      return wrapBlock(`<blockquote>${inner}</blockquote>`, isTop, idx, count);
    }
    case "list": {
      let tag = node.ordered ? "ol" : "ul";
      let startAttr = "";
      if (node.ordered && node.start !== null && node.start !== 1) {
        startAttr = ` start="${node.start}"`;
      }
      let inner = node.children.map((c, i) => renderAstToHtml(c, false, i, node.children.length)).join("");
      return wrapBlock(`<${tag}${startAttr}>${inner}</${tag}>`, isTop, idx, count);
    }
    case "list_item": {
      let inner = node.children.map((c, i) => renderAstToHtml(c, false, i, node.children.length)).join("");
      return `<li>${inner}</li>`;
    }
    case "thematic_break":
      return wrapBlock("<hr />", isTop, idx, count);
    case "html_block":
      return wrapBlock(node.value, isTop, idx, count);
    case "code_block": {
      let lang = node.language ? ` class="language-${escapeHtmlAttr(node.language)}"` : "";
      let escaped = escapeHtml(node.value);
      return wrapBlock(`<pre><code${lang}>${escaped}</code></pre>`, isTop, idx, count);
    }
    case "text":
      return escapeHtml(node.value);
    case "emphasis":
      return `<em>${node.children.map((c, i) => renderAstToHtml(c, false, i, node.children.length)).join("")}</em>`;
    case "strong":
      return `<strong>${node.children.map((c, i) => renderAstToHtml(c, false, i, node.children.length)).join("")}</strong>`;
    case "code_span":
      return `<code>${escapeHtml(node.code)}</code>`;
    case "linebreak":
      return `<br />`;
    case "raw_html":
      return node.content;
    case "link": {
      let inn = node.children.map((c, i) => renderAstToHtml(c, false, i, node.children.length)).join("");
      let t = node.title ? ` title="${escapeHtmlAttr(node.title)}"` : "";
      return `<a href="${escapeUrl(node.url)}"${t}>${inn}</a>`;
    }
    case "image": {
      let t = node.title ? ` title="${escapeHtmlAttr(node.title)}"` : "";
      return `<img src="${escapeUrl(node.url)}" alt="${escapeHtmlAttr(node.alt)}"${t} />`;
    }
  }
}

export function wrapBlock(html: string, isTop: boolean, idx: number, count: number): string {
  // Optionally insert newlines or spaces between top-level blocks:
  // CommonMark doesn't strictly require blank lines.  We'll just do a newline.
  if (isTop && idx < count - 1) {
    return html + "\n";
  }
  return html;
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeHtmlAttr(str: string): string {
  return escapeHtml(str);
}

export function escapeUrl(str: string): string {
  // minimal
  return str.replace(/"/g, "%22");
}
