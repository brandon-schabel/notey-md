import type {
  MarkdownNode,
  DocumentNode,
  ParagraphNode,
  HeadingNode,
  BlockquoteNode,
  ListNode,
  ListItemNode,
  CodeBlockNode,
  ThematicBreakNode,
  HtmlBlockNode,
  RefDefinition,
} from './ast';
import { getParagraphContent, tryHtmlBlockOpenStrict } from './parser-helpers';


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
      const fence = (top as CodeBlockNode).fence!;
      if (trimmed === fence || (trimmed.startsWith(fence) && trimmed.slice(fence.length).trim() === "")) {
        // Closing fence detected: do not add this line – just pop the code block.
        stack.pop();
        lastLineBlank = true;
        continue;
      } else {
        // Append the line (with a newline) to the code block's content.
        appendContentToCode(top as CodeBlockNode, line);
        continue;
      }
    }

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
      // Recompute the offset consumed by all open containers.
      let finalOffset = 0;
      for (let idx = 1; idx < stack.length; idx++) {
        finalOffset = consumeContainerMarkers(stack[idx], line, finalOffset);
      }
      // Append the text from the offset onward.
      if (stack[stack.length - 1].type === "paragraph") {
        let para = stack[stack.length - 1] as ParagraphNode;
        let currentText = getParagraphContent(para);
        setParagraphContent(para, currentText ? currentText + "\n" + line.slice(finalOffset) : line.slice(finalOffset));
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
      const paraText = getParagraphContent(para).trim();
      if (paraText !== "") {
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


// Placeholder for fenced code block ending detection.
// Currently hardcoded to false.
export function hasFencedEnding(line: string): boolean {
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

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
} 