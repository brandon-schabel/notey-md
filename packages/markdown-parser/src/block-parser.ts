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
import {
  getParagraphContent,
  setParagraphContent,
  parseRefDefLine,
  normalizeRefLabel,
  appendContentToCode,
  tryHtmlBlockOpenStrict,
} from "./parser-helpers";

export function blockPhase(markdown: string): DocumentNode {
  // Normalize line endings and expand tabs to 4 spaces
  let content = markdown.replace(/\r\n?/g, "\n").replace(/\t/g, "    ");
  const lines = content.split("\n");

  const doc: DocumentNode = {
    type: "document",
    children: [],
    refDefinitions: new Map(),
  };

  let stack: MarkdownNode[] = [doc];
  let lastLineWasBlank = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const top = stack[stack.length - 1];

    if (top.type === "code_block" && top.fence) {
      const trimmed = line.trim();
      const fence = top.fence;
      if (
        trimmed === fence ||
        (trimmed.startsWith(fence) && trimmed.slice(fence.length).trim() === "")
      ) {
        stack.pop();
        continue;
      } else {
        appendContentToCode(top, line);
        continue;
      }
    }

    let currentIdx = 1;
    let offset = 0;
    while (currentIdx < stack.length) {
      const container = stack[currentIdx];
      if (!canContainLine(container, line, offset)) {
        while (stack.length > currentIdx) {
          closeBlock(stack, doc.refDefinitions);
        }
        break;
      }
      offset = consumeContainerMarkers(container, line, offset);
      currentIdx++;
    }

    let opened = tryOpenNewContainers(stack, line, offset);

    if (!opened) {
      if (!line.trim()) {
        handleBlankLine(stack, doc.refDefinitions);
        lastLineWasBlank = true;
        continue;
      }
      let sTop = stack[stack.length - 1];
      if (sTop.type !== "paragraph" && sTop.type !== "code_block") {
        const p: ParagraphNode = { type: "paragraph", children: [] };
        addChild(sTop, p);
        stack.push(p);
      }
      let finalOffset = 0;
      for (let idx = 1; idx < stack.length; idx++) {
        finalOffset = consumeContainerMarkers(stack[idx], line, finalOffset);
      }
      let para = stack[stack.length - 1] as ParagraphNode;
      let currentText = getParagraphContent(para);
      setParagraphContent(
        para,
        currentText ? currentText + "\n" + line.slice(finalOffset) : line.slice(finalOffset),
      );
    }

    if (line.trim()) {
      lastLineWasBlank = false;
    }
  }

  while (stack.length > 0) {
    closeBlock(stack, doc.refDefinitions);
  }

  finalizeLists(doc);
  return doc;
}

export function canContainLine(container: MarkdownNode, line: string, offset: number): boolean {
  if (container.type === "document") return true;
  if (container.type === "blockquote") {
    if (/^[ ]{0,3}>/.test(line.slice(offset)) || !line.trim()) return true;
    return false;
  }
  if (container.type === "list_item") {
    const listMarker = getListMarker(line.slice(offset));
    if (listMarker) {
      return false;
    }
    // Indented code block within list item
    if (/^ {4,}/.test(line.slice(offset))) {
      return true;
    }
    // Lazy continuation
    if (line.trim() && !/^[ ]{0,3}(>|[*+\-]|\d+[.)])/.test(line.slice(offset))) {
      return true;
    }
    return false;
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
  let currentOffset = offset;
  let currentLine = line.slice(currentOffset);
  const container = stack[stack.length - 1];

  if (container.type === "paragraph") {
    const setext = currentLine.match(/^[ ]{0,3}(=+|-+)\s*$/);
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

  if (isThematicBreak(currentLine)) {
    closeParagraphIfOpen(stack);
    const hr: ThematicBreakNode = { type: "thematic_break" };
    addChild(stack[stack.length - 1], hr);
    return true;
  }

  const atx = parseAtxHeading(currentLine);
  if (atx) {
    closeParagraphIfOpen(stack);
    addChild(stack[stack.length - 1], atx);
    return true;
  }

  if (isFencedCodeStart(currentLine.trim())) {
    closeParagraphIfOpen(stack);
    const match = currentLine.trim().match(/^(`{3,}|~{3,})(.*)$/);
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

  // Blockquote (before list)
  const bqMatch = currentLine.match(/^[ ]{0,3}>( ?)?/);
  if (bqMatch) {
    let parent = stack[stack.length - 1];
    if (parent.type !== "blockquote") {
      closeParagraphIfOpen(stack);
      const bq: BlockquoteNode = { type: "blockquote", children: [] };
      addChild(stack[stack.length - 1], bq);
      stack.push(bq);
      parent = bq;
    }
    currentOffset += bqMatch[0].length;
    return true;
  }

  const listMatch = getListMarker(currentLine);
  if (listMatch) {
    closeParagraphIfOpen(stack);
    while (stack.length && stack[stack.length - 1].type === "list_item") {
      closeBlock(stack, null);
    }
    const wantOrdered = listMatch.ordered;
    const wantStart = listMatch.start;
    let parentList: ListNode | null = null;
    const top = stack[stack.length - 1];
    if (top.type === "list") {
      if (top.ordered === wantOrdered) {
        parentList = top;
      } else {
        while (stack.length && stack[stack.length - 1].type !== "document") {
          const t = stack[stack.length - 1];
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
      const newList: ListNode = {
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
    const li: ListItemNode = { type: "list_item", children: [] };
    addChild(parentList, li);
    stack.push(li);
    return true;
  }

  const indentMatch = currentLine.match(/^ {4,}(.*)$/);
  if (indentMatch) {
    closeParagraphIfOpen(stack);
    const codeLine = indentMatch[1];
    const topNode = stack[stack.length - 1];
    if (topNode.type === "list_item") {
      const codeBlock: CodeBlockNode = { type: "code_block", value: codeLine };
      addChild(topNode, codeBlock);
      stack.push(codeBlock);
    } else if (topNode.type === "code_block" && !topNode.fence) {
      appendContentToCode(topNode, codeLine);
    } else {
      const cb: CodeBlockNode = { type: "code_block", value: codeLine };
      addChild(stack[stack.length - 1], cb);
      stack.push(cb);
    }
    return true;
  }

  const maybeHtmlBlock = tryHtmlBlockOpenStrict(currentLine.trim());
  if (maybeHtmlBlock) {
    closeParagraphIfOpen(stack);
    const block: HtmlBlockNode = { type: "html_block", value: maybeHtmlBlock.content };
    addChild(stack[stack.length - 1], block);
    return true;
  }

  return false;
}

export function closeParagraphIfOpen(stack: MarkdownNode[]) {
  let top = stack[stack.length - 1];
  if (top.type === "paragraph") {
    closeBlock(stack, null);
  }
}

export function handleBlankLine(stack: MarkdownNode[], refMap: Map<string, RefDefinition> | null) {
  const top = stack[stack.length - 1];
  if (top.type === "paragraph") {
    closeBlock(stack, refMap);
  } else if (top.type === "code_block") {
    appendContentToCode(top, "");
  } else if (top.type === "list_item") {
    if (top.children.length === 1 && top.children[0].type === "paragraph") {
      closeBlock(stack, refMap);
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

export function getListMarker(line: string): {
  ordered: boolean;
  start: number;
  bulletChar?: string;
} | null {
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
    parent.children.push(child);
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

function finalizeLists(doc: DocumentNode) {
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
              for (const child of children) {
                if (child.type === "paragraph") {
                  for (const c of child.children) {
                    addChild(paragraph, c);
                  }
                } else {
                  addChild(paragraph, child);
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
