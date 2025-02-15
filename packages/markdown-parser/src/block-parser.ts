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
} from "./ast";
import { isDebugMode, logDebug } from "./debug";
import {
  getParagraphContent,
  setParagraphContent,
  parseRefDefLine,
  normalizeRefLabel,
  appendContentToCode,
  tryHtmlBlockOpenStrict,
  parseListLine,
} from "./parser-helpers";

export function blockPhase(markdown: string): DocumentNode {
  let content = markdown.replace(/\r\n?/g, "\n").replace(/\t/g, "    ");
  const lines = content.split("\n");

  const doc: DocumentNode = {
    type: "document",
    children: [],
    refDefinitions: new Map(),
  };

  let stack: MarkdownNode[] = [doc];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (isDebugMode()) {
      logDebug(`Processing line ${i}: ${JSON.stringify(line)}`);
    }
    const top = stack[stack.length - 1];

    if (top.type === "code_block" && top.fence) {
      const closed = maybeCloseFencedCodeBlock(stack, line);
      if (!closed) {
        appendContentToCode(top, line);
      }
      continue;
    }

    let offset = 0;
    let containerIndex = 1;
    while (containerIndex < stack.length) {
      const container = stack[containerIndex];
      if (!canContainLine(container, line, offset)) {
        while (stack.length > containerIndex) {
          closeBlock(stack, doc.refDefinitions);
        }
        break;
      }
      offset = consumeContainerMarkers(container, line, offset);
      containerIndex++;
    }

    const opened = tryOpenNewContainers(stack, line, offset);
    if (!opened) {
      if (!line.trim()) {
        handleBlankLine(stack, doc.refDefinitions);
      } else {
        let sTop = stack[stack.length - 1];
        if (sTop.type !== "paragraph" && sTop.type !== "code_block") {
          const p: ParagraphNode = { type: "paragraph", children: [] };
          addChild(sTop, p);
          stack.push(p);
        }
        let para = stack[stack.length - 1] as ParagraphNode;
        let currentText = getParagraphContent(para);
        const appended = currentText
          ? currentText + "\n" + line.slice(offset)
          : line.slice(offset);
        setParagraphContent(para, appended);
      }
    }
  }

  while (stack.length > 0) {
    closeBlock(stack, doc.refDefinitions);
  }
  finalizeLists(doc);
  return doc;
}

function maybeCloseFencedCodeBlock(stack: MarkdownNode[], line: string): boolean {
  const top = stack[stack.length - 1];
  if (top.type !== "code_block" || !top.fence) return false;
  const trimmed = line.trim();
  const fence = top.fence;
  if (
    trimmed === fence ||
    (trimmed.startsWith(fence) && trimmed.slice(fence.length).trim() === "")
  ) {
    stack.pop();
    return true;
  }
  return false;
}

export function canContainLine(container: MarkdownNode, line: string, offset: number): boolean {
  if (container.type === "document") return true;
  if (container.type === "blockquote") {
    if (/^[ ]{0,3}>/.test(line.slice(offset)) || !line.trim()) return true;
    return false;
  }
  if (container.type === "list_item") {
    const next = parseListLine(line.slice(offset));
    if (next) return false; // new bullet => can't stay in this item
    // we allow blank or text => lazy continuation
    return true;
  }
  if (container.type === "list") return true;
  if (container.type === "code_block") return true;
  if (container.type === "paragraph") {
    if (line.trim()) return true;
    return false;
  }
  return false;
}

export function consumeContainerMarkers(container: MarkdownNode, line: string, offset: number): number {
  if (container.type === "blockquote") {
    const match = line.slice(offset).match(/^[ ]{0,3}>( ?)?/);
    if (match) {
      offset += match[0].length;
    }
  }
  return offset;
}

export function tryOpenNewContainers(stack: MarkdownNode[], line: string, offset: number): boolean {
  const trimmedLine = line.slice(offset);
  const container = stack[stack.length - 1];

  // Setext heading under paragraph
  if (container.type === "paragraph") {
    const setext = trimmedLine.match(/^[ ]{0,3}(=+|-+)\s*$/);
    if (setext) {
      const para = container as ParagraphNode;
      const paraText = getParagraphContent(para).trim();
      if (paraText !== "") {
        stack.pop();
        const parent = stack[stack.length - 1];
        removeNodeChild(parent, para);
        const heading: HeadingNode = {
          type: "heading",
          level: setext[1].startsWith("=") ? 1 : 2,
          children: [{ type: "text", value: paraText }],
        };
        addChild(parent, heading);
        return true;
      }
    }
  }

  // Thematic break
  if (isThematicBreak(trimmedLine)) {
    closeParagraphIfOpen(stack);
    const hr: ThematicBreakNode = { type: "thematic_break" };
    addChild(stack[stack.length - 1], hr);
    return true;
  }

  // ATX heading
  const atx = parseAtxHeading(trimmedLine);
  if (atx) {
    closeParagraphIfOpen(stack);
    addChild(stack[stack.length - 1], atx);
    return true;
  }

  // Fenced code block
  if (isFencedCodeStart(trimmedLine)) {
    closeParagraphIfOpen(stack);
    const match = trimmedLine.match(/^(`{3,}|~{3,})(.*)$/);
    if (match) {
      const fence = match[1];
      const info = match[2] ? match[2].trim() : "";
      const node: CodeBlockNode = {
        type: "code_block",
        language: info || undefined,
        value: "",
        fence: fence,
      };
      addChild(stack[stack.length - 1], node);
      stack.push(node);
      return true;
    }
  }

  // Blockquote
  const bqMatch = trimmedLine.match(/^[ ]{0,3}>( ?)?/);
  if (bqMatch) {
    let parent = stack[stack.length - 1];
    if (parent.type !== "blockquote") {
      closeParagraphIfOpen(stack);
      const bq: BlockquoteNode = { type: "blockquote", children: [] };
      addChild(stack[stack.length - 1], bq);
      stack.push(bq);
      parent = bq;
    }
    return true;
  }

  // List line
  const lineInfo = parseListLine(trimmedLine);
  if (lineInfo) {
    closeParagraphIfOpen(stack);

    // close any open list_item
    while (stack.length && stack[stack.length - 1].type === "list_item") {
      closeBlock(stack, null);
    }

    let listNode: ListNode | null = null;
    const topNode = stack[stack.length - 1];
    if (topNode.type === "list") {
      const candidate = topNode as ListNode;
      if (sameListType(candidate, lineInfo)) {
        listNode = candidate;
      } else {
        // close old list
        while (stack.length && stack[stack.length - 1].type === "list") {
          closeBlock(stack, null);
        }
      }
    }

    if (!listNode) {
      const newList: ListNode = {
        type: "list",
        ordered: lineInfo.ordered,
        start: lineInfo.ordered ? lineInfo.start : null,
        tight: true,
        bulletChar: lineInfo.bulletChar,
        delimiter: lineInfo.delimiter,
        children: [],
      };
      addChild(stack[stack.length - 1], newList);
      stack.push(newList);
      listNode = newList;
    }

    // new list item
    const li: ListItemNode = { type: "list_item", children: [] };
    addChild(listNode, li);
    stack.push(li);

    const leftover = lineInfo.content;
    if (leftover.trim()) {
      const p: ParagraphNode = { type: "paragraph", children: [] };
      setParagraphContent(p, leftover);
      addChild(li, p);
      stack.push(p);
    }
    return true;
  }

  // Indented code
  const indentMatch = trimmedLine.match(/^ {4,}(.*)$/);
  if (indentMatch) {
    closeParagraphIfOpen(stack);
    const codeLine = indentMatch[1];
    const topNode = stack[stack.length - 1];
    if (topNode.type === "code_block" && !topNode.fence) {
      appendContentToCode(topNode, codeLine);
    } else {
      const cb: CodeBlockNode = { type: "code_block", value: codeLine };
      addChild(topNode, cb);
      stack.push(cb);
    }
    return true;
  }

  // Strict HTML block
  const maybeHtmlBlock = tryHtmlBlockOpenStrict(trimmedLine);
  if (maybeHtmlBlock) {
    closeParagraphIfOpen(stack);
    const block: HtmlBlockNode = { type: "html_block", value: maybeHtmlBlock.content };
    addChild(stack[stack.length - 1], block);
    return true;
  }

  return false;
}

function sameListType(list: ListNode, info: ReturnType<typeof parseListLine>) {
  if (!info) return false;
  if (list.ordered !== info.ordered) return false;
  if (info.ordered) {
    // must match delimiter
    return list.delimiter === info.delimiter;
  } else {
    // must match bulletChar
    return list.bulletChar === info.bulletChar;
  }
}

export function handleBlankLine(stack: MarkdownNode[], refMap: Map<string, RefDefinition> | null) {
  const top = stack[stack.length - 1];
  if (top.type === "paragraph") {
    closeBlock(stack, refMap);
  } else if (top.type === "code_block") {
    appendContentToCode(top, "");
  } else if (top.type === "list_item") {
    // an empty line in a list item => ensure next text is a new paragraph
    // but do not close the item
    const item = top as ListItemNode;
    const lastChild = item.children[item.children.length - 1];
    if (!lastChild || lastChild.type !== "paragraph") {
      // sets the list to not tight
      const parentList = stack.find(s => s.type === "list") as ListNode;
      if (parentList) parentList.tight = false;
    }
  } else if (top.type === "list") {
    top.tight = false;
  }
}

export function closeBlock(stack: MarkdownNode[], refMap: Map<string, RefDefinition> | null) {
  const block = stack.pop();
  if (!block) return;
  if (block.type === "paragraph" && refMap) {
    const text = getParagraphContent(block).trim();
    const lines = text.split("\n");
    const leftover: string[] = [];
    for (const line of lines) {
      const def = parseRefDefLine(line);
      if (def) {
        const normLabel = normalizeRefLabel(def.label);
        if (!refMap.has(normLabel)) {
          refMap.set(normLabel, { label: normLabel, url: def.url, title: def.title });
        }
      } else {
        leftover.push(line);
      }
    }
    if (leftover.length === 0) {
      const parent = stack[stack.length - 1];
      removeNodeChild(parent, block);
    } else {
      setParagraphContent(block, leftover.join("\n"));
    }
  }
}

export function isFencedCodeStart(line: string): boolean {
  return /^(`{3,}|~{3,})/.test(line);
}

export function parseAtxHeading(line: string): HeadingNode | null {
  const re = /^(#{1,6})(?:[ \t]+|$)(.*?)(?:[ \t]+#+[ \t]*|[ \t]*)$/;
  const m = line.match(re);
  if (!m) return null;
  const rawHashes = m[1];
  if (rawHashes.length > 6) return null;
  let text = m[2] || "";
  let level = rawHashes.length;
  return {
    type: "heading",
    level,
    children: [{ type: "text", value: text }],
  };
}

export function isThematicBreak(line: string): boolean {
  const t = line.trim().replace(/\s+/g, "");
  if (/^(?:\*{3,}|-{3,}|_{3,})$/.test(t)) return true;
  return false;
}

export function addChild(parent: MarkdownNode, child: MarkdownNode) {
  if (parent.type === "document") {
    parent.children.push(child);
    return;
  }
  if (parent.type === "list" && child.type === "list_item") {
    parent.children.push(child);
    return;
  }
  if (
    parent.type === "list_item" &&
    (child.type === "paragraph" ||
      child.type === "code_block" ||
      child.type === "list" ||
      child.type === "blockquote")
  ) {
    parent.children.push(child);
    return;
  }
  if (
    parent.type === "blockquote" &&
    (child.type === "paragraph" ||
      child.type === "heading" ||
      child.type === "code_block" ||
      child.type === "list" ||
      child.type === "thematic_break" ||
      child.type === "html_block" ||
      child.type === "blockquote")
  ) {
    parent.children.push(child);
    return;
  }
  if ("children" in parent && Array.isArray(parent.children)) {
    // @ts-ignore
    parent.children.push(child);
  }
}

export function removeNodeChild(parent: MarkdownNode, child: MarkdownNode) {
  if ("children" in parent) {
    let arr = parent.children as MarkdownNode[];
    let idx = arr.indexOf(child);
    if (idx !== -1) arr.splice(idx, 1);
  }
}

export function finalizeLists(doc: DocumentNode) {
  const visit = (node: MarkdownNode) => {
    if (node.type === "list") {
      if (!node.tight) {
        for (const item of node.children) {
          if (item.type === "list_item") {
            let hasBlocks = false;
            for (let child of item.children) {
              if (child.type !== "paragraph" && child.type !== "list") hasBlocks = true;
            }
            if (!hasBlocks) {
              const children = item.children;
              item.children = [];
              const paragraph: ParagraphNode = { type: "paragraph", children: [] };
              for (const c of children) {
                if (c.type === "paragraph") {
                  for (const cc of c.children) {
                    addChild(paragraph, cc);
                  }
                } else {
                  addChild(paragraph, c);
                }
              }
              addChild(item, paragraph);
            }
          }
        }
      }
    }
    if ("children" in node && Array.isArray(node.children)) {
      for (const child of node.children) {
        visit(child);
      }
    }
  };
  visit(doc);
}

export function closeParagraphIfOpen(stack: MarkdownNode[]) {
  const top = stack[stack.length - 1];
  if (top?.type === "paragraph") {
    closeBlock(stack, null);
  }
}