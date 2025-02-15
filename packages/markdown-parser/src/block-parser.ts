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
  parseListLine, 
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

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const top = stack[stack.length - 1];

    // If we are inside a fenced code block, check for fence closing
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

    // Let containers (blockquote, lists, etc) try to consume line
    let offset = 0;
    let currentIdx = 1;
    while (currentIdx < stack.length) {
      const container = stack[currentIdx];
      if (!canContainLine(container, line, offset)) {
        // close anything deeper
        while (stack.length > currentIdx) {
          closeBlock(stack, doc.refDefinitions);
        }
        break;
      }
      offset = consumeContainerMarkers(container, line, offset);
      currentIdx++;
    }

    // Attempt to open new blocks (blockquotes, lists, headings, etc)
    let opened = tryOpenNewContainers(stack, line, offset);

    // If no new block was opened and the line isn't blank, treat as paragraph text
    if (!opened) {
      if (!line.trim()) {
        handleBlankLine(stack, doc.refDefinitions);
        continue;
      }
      let sTop = stack[stack.length - 1];
      // create a new paragraph if top is not paragraph or code_block
      if (sTop.type !== "paragraph" && sTop.type !== "code_block") {
        const p: ParagraphNode = { type: "paragraph", children: [] };
        addChild(sTop, p);
        stack.push(p);
      }
      // Now append the text into that paragraph
      let para = stack[stack.length - 1] as ParagraphNode;
      let currentText = getParagraphContent(para);
      setParagraphContent(
        para,
        currentText ? currentText + "\n" + line.slice(offset) : line.slice(offset),
      );
    }
  }

  // Close any remaining open blocks
  while (stack.length > 0) {
    closeBlock(stack, doc.refDefinitions);
  }

  // finalize lists (tight vs. loose) etc.
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
    // If line matches a new bullet, can't stay in this item
    const listLine = parseListLine(line.slice(offset));
    if (listLine) {
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
  let currentLine = line.slice(offset);
  const container = stack[stack.length - 1];

  // Setext heading under paragraph
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

  // Thematic break
  if (isThematicBreak(currentLine)) {
    closeParagraphIfOpen(stack);
    const hr: ThematicBreakNode = { type: "thematic_break" };
    addChild(stack[stack.length - 1], hr);
    return true;
  }

  // ATX heading ( # Heading )
  const atx = parseAtxHeading(currentLine);
  if (atx) {
    closeParagraphIfOpen(stack);
    addChild(stack[stack.length - 1], atx);
    return true;
  }

  // Fenced code block
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

  // Blockquote
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
    return true;
  }

  // List line (bullet or ordered)
  const listLineInfo = parseListLine(currentLine);
  if (listLineInfo) {
    // Close any open paragraph
    closeParagraphIfOpen(stack);

    // Close previous list item if it exists
    while (stack.length && stack[stack.length - 1].type === "list_item") {
      closeBlock(stack, null);
    }

    // Create or reuse list
    let top = stack[stack.length - 1];
    let existingList: ListNode | null = null;
    if (top.type === "list") {
      // check if the newly found bullet type matches the existing list type
      if (top.ordered === listLineInfo.ordered) {
        existingList = top;
      } else {
        // different list type, so close the old one
        while (stack.length && stack[stack.length - 1].type === "list") {
          closeBlock(stack, null);
        }
      }
    }

    if (!existingList) {
      const newList: ListNode = {
        type: "list",
        ordered: listLineInfo.ordered,
        start: listLineInfo.ordered ? listLineInfo.start : null,
        tight: true,
        children: [],
      };
      addChild(stack[stack.length - 1], newList);
      stack.push(newList);
      existingList = newList;
    }

    // Add a new list item
    const li: ListItemNode = { type: "list_item", children: [] };
    addChild(existingList, li);
    stack.push(li);

    // If there's leftover text on the bullet line, store it in a paragraph
    const leftover = listLineInfo.content.trim();
    if (leftover) {
      const p: ParagraphNode = { type: "paragraph", children: [] };
      setParagraphContent(p, leftover);
      addChild(li, p);
      stack.push(p);
    }

    return true;
  }

  // Indented code block (4+ spaces)
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

  // Strict HTML block
  const maybeHtmlBlock = tryHtmlBlockOpenStrict(currentLine.trim());
  if (maybeHtmlBlock) {
    closeParagraphIfOpen(stack);
    const block: HtmlBlockNode = { type: "html_block", value: maybeHtmlBlock.content };
    addChild(stack[stack.length - 1], block);
    return true;
  }

  // No new container opened
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