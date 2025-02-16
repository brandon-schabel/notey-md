import type { MarkdownNode, DocumentNode, RefDefinition, TextNode, ImageNode, LinkNode, BlockquoteNode, EmphasisNode, HeadingNode, ListItemNode, ListNode, ParagraphNode, StrongNode } from "./ast";
import { logDebug } from "./debug";
import { isDebugMode } from "./debug";
import { parseInlinesWithDelimiterStack } from "./inline-parser/parse-inlines-with-delimiter-stack";
import { getParagraphContent, tryHtmlBlockOpenStrict } from "./parser-helpers";

export interface InlineToken {
  type: string;
  content: string;
  raw?: string;
  potential?: boolean;
}

export function walkBlockTreeAndParseInlines(
  root: DocumentNode,
  refMap: Map<string, RefDefinition>,
) {
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
        let raw = "";
        if (node.type === "paragraph") {
          raw = getParagraphContent(node);
        } else if (node.type === "heading") {
          raw = node.children
            .map((ch) => (ch.type === "text" ? ch.value : ""))
            .join("");
        }
        let inlines = parseInlineString(raw, refMap);
        node.children = inlines;
        break;
      case "code_block":
      case "thematic_break":
      case "html_block":
        break;
      default:
        break;
    }
  }
  for (let c of root.children) {
    if (isDebugMode()) {
      logDebug(`Inline parsing for node type: ${c.type}`);
    }
    recurse(c);
  }
}
export function parseInlineString(
  input: string,
  refMap: Map<string, RefDefinition>,
): MarkdownNode[] {
  const tokens = lexInline(input)
  const nodes = parseInlinesWithDelimiterStack(tokens, refMap)
  return linkResolver(nodes, refMap)
}

export function lexInline(line: string): InlineToken[] {
  const tokens: InlineToken[] = []
  let i = 0
  while (i < line.length) {
    const c = line[i]
    if (c === "\\") {
      const next = line[i + 1] || ""
      if (/\n/.test(next)) {
        tokens.push({ type: "br", content: "" })
        i += 2
        continue
      } else if (/[\`\*\_$~\\]/.test(next)) {
        tokens.push({ type: "text", content: next })
        i += 2
        continue
      } else {
        tokens.push({ type: "text", content: "\\" })
        i++
        continue
      }
    }
    if (c === "`") {
      let runLen = 1
      let j = i + 1
      while (j < line.length && line[j] === "`") {
        runLen++
        j++
      }
      const closer = "`".repeat(runLen)
      const endPos = line.indexOf(closer, j)
      if (endPos === -1) {
        tokens.push({ type: "text", content: line.slice(i, j) })
        i = j
        continue
      } else {
        let codeContent = line.slice(j, endPos)
        if (codeContent.length > 0 && codeContent.startsWith(" ") && codeContent.endsWith(" ") && codeContent.trim() !== "") {
          codeContent = codeContent.slice(1, -1)
        }
        tokens.push({ type: "code_span", content: codeContent })
        i = endPos + runLen
        continue
      }
    }
    if (c === "<") {
      const auto = matchAutolink(line, i)
      if (auto) {
        tokens.push({ type: "autolink", content: auto.content })
        i += auto.length
        continue
      }
      const raw = matchRawInlineHtml(line, i)
      if (raw) {
        if (tryHtmlBlockOpenStrict(raw.content)) {
          tokens.push({ type: "raw_html", content: raw.content })
        } else {
          tokens.push({ type: "text", content: raw.content })
        }
        i += raw.length
        continue
      }
      tokens.push({ type: "text", content: "<" })
      i++
      continue
    }
    if (c === "*" || c === "_") {
      let runStart = i
      let runChar = c
      let runCount = 1
      let k = i + 1
      while (k < line.length && line[k] === runChar) {
        runCount++
        k++
      }
      tokens.push({ type: "delim", content: runChar.repeat(runCount) })
      i = k
      continue
    }
    if (c === "[") {
      tokens.push({ type: "lbracket", content: "[" })
      i++
      continue
    }
    if (c === "]") {
      tokens.push({ type: "rbracket", content: "]" })
      i++
      continue
    }
    if (c === "(") {
      tokens.push({ type: "lparen", content: "(" })
      i++
      continue
    }
    if (c === ")") {
      tokens.push({ type: "rparen", content: ")" })
      i++
      continue
    }
    if (c === "\n") {
      tokens.push({ type: "softbreak", content: "" })
      i++
      continue
    }
    tokens.push({ type: "text", content: c })
    i++
  }
  return tokens
}

export function matchAutolink(str: string, start: number) {
  const sub = str.slice(start)
  const re = /^<([A-Za-z][A-Za-z0-9+.-]{1,31}:[^<>\s]+|[^\s<>@]+@[^\s<>]+)>/
  const m = sub.match(re)
  if (!m) return null
  return { content: m[1], length: m[0].length }
}

export function matchRawInlineHtml(str: string, start: number) {
  const sub = str.slice(start)
  const re = /^<([a-zA-Z\/][^>\n]*)>/
  const m = sub.match(re)
  if (!m) return null
  return { content: m[0], length: m[0].length }
}



function nodeHasChildren(node: MarkdownNode): node is (
  | LinkNode
  | EmphasisNode
  | StrongNode
  | ParagraphNode
  | HeadingNode
  | BlockquoteNode
  | ListNode
  | ListItemNode
) {
  return "children" in node;
}

export function linkResolver(inlineNodes: MarkdownNode[], refMap: Map<string, RefDefinition>): MarkdownNode[] {
  // Recurse into children of emphasis/strong/link/etc. to handle nested bracket parsing
  for (let i = 0; i < inlineNodes.length; i++) {
    const node = inlineNodes[i];
    // Only nodes that do have a children array
    if (nodeHasChildren(node)) {
      node.children = linkResolver(node.children, refMap);
    }
  }

  // Then transform bracket tokens ([, ], etc.) into LinkNodes or ImageNodes
  return transformLinksAndImages(inlineNodes, refMap);
}

function transformLinksAndImages(nodes: MarkdownNode[], refMap: Map<string, RefDefinition>): MarkdownNode[] {
  const result: MarkdownNode[] = [];
  let i = 0;

  while (i < nodes.length) {
    const current = nodes[i];
    // Try parsing as image if you see "!" followed by "["
    if (isTextNode(current, "!") && isTextNode(nodes[i + 1], "[")) {
      const parsedImg = tryParseLinkOrImage(nodes, refMap, i, true /* isImage */);
      if (parsedImg) {
        const { _nextIndex, ...finalNode } = parsedImg;
        result.push(finalNode);         // finalNode is now a proper ImageNode
        i = _nextIndex;
        continue;
      }
    }
    // Try parsing as link if you see "["
    if (isTextNode(current, "[")) {
      const parsedLink = tryParseLinkOrImage(nodes, refMap, i, false /* isImage */);
      if (parsedLink) {
        const { _nextIndex, ...finalNode } = parsedLink;
        result.push(finalNode);         // finalNode is a proper LinkNode
        i = _nextIndex;
        continue;
      }
    }
    // Otherwise, just push it as-is
    result.push(current);
    i++;
  }
  return result;
}


// A helper union type for a “link or image + _nextIndex”.
type LinkOrImageWithIndex =
  | (LinkNode & { _nextIndex: number })
  | (ImageNode & { _nextIndex: number });

function tryParseLinkOrImage(
  nodes: MarkdownNode[],
  refMap: Map<string, RefDefinition>,
  startIndex: number,
  isImage: boolean
): LinkOrImageWithIndex | null {
  // For an image, we expect nodes at startIndex = "!", startIndex+1 = "["
  // For a link,  we expect nodes at startIndex = "["
  const bracketOpenIndex = isImage ? startIndex + 1 : startIndex;

  // Find the matching "]"
  let bracketCloseIndex = -1;
  for (let j = bracketOpenIndex + 1; j < nodes.length; j++) {
    if (isTextNode(nodes[j], "]")) {
      bracketCloseIndex = j;
      break;
    }
  }
  if (bracketCloseIndex === -1) return null;

  // The text inside the [...], used as either link text or image alt text
  const labelNodes = nodes.slice(bracketOpenIndex + 1, bracketCloseIndex);
  const linkText = getNodeText(labelNodes);

  // Check the token after the "]"
  const afterBracketClose = bracketCloseIndex + 1;
  const nextNode = nodes[afterBracketClose] ?? null;

  // Reference link: [text][label] or [text][] or [ref]
  if (isTextNode(nextNode, "[")) {
    // find the closing "]"
    let bracket2Close = -1;
    for (let k = afterBracketClose + 1; k < nodes.length; k++) {
      if (isTextNode(nodes[k], "]")) {
        bracket2Close = k;
        break;
      }
    }
    if (bracket2Close === -1) return null;

    // The text inside the second brackets
    const refLabelNodes = nodes.slice(afterBracketClose + 1, bracket2Close);
    let refLabel = getNodeText(refLabelNodes).toLowerCase();
    if (!refLabel) {
      // collapsed reference => use linkText as the label
      refLabel = linkText.toLowerCase();
    }

    const def = refMap.get(refLabel);
    if (!def) return null; // not a known reference

    if (isImage) {
      // Construct an ImageNode
      return {
        type: "image",
        url: def.url,
        title: def.title ?? "",
        alt: linkText,
        _nextIndex: bracket2Close + 1
      };
    } else {
      // Construct a LinkNode
      return {
        type: "link",
        url: def.url,
        title: def.title ?? "",
        children: [{ type: "text", value: linkText }],
        _nextIndex: bracket2Close + 1
      };
    }
  }

  //  Inline link: [text](url "title")
  if (isTextNode(nextNode, "(")) {
    // find closing ")"
    let parenCloseIndex = -1;
    for (let k = afterBracketClose + 1; k < nodes.length; k++) {
      if (isTextNode(nodes[k], ")")) {
        parenCloseIndex = k;
        break;
      }
    }
    if (parenCloseIndex === -1) return null;

    // parse the content inside ( ... ) to extract url + title
    const insideParenNodes = nodes.slice(afterBracketClose + 1, parenCloseIndex);
    const { url, title } = parseUrlAndTitle(getNodeText(insideParenNodes));

    if (isImage) {
      // Image node
      return {
        type: "image",
        url,
        title,
        alt: linkText,
        _nextIndex: parenCloseIndex + 1
      };
    } else {
      // Link node
      return {
        type: "link",
        url,
        title,
        children: [{ type: "text", value: linkText }],
        _nextIndex: parenCloseIndex + 1
      };
    }
  }

  return null; // no match
}

// ---------------------------------------------------
// 5) Helper functions
// ---------------------------------------------------
function getNodeText(nodes: MarkdownNode[]): string {
  return nodes
    .filter(n => n.type === "text")
    .map(n => (n as TextNode).value)
    .join("");
}

function isTextNode(node: MarkdownNode | null, exact: string): boolean {
  return !!node && node.type === "text" && (node as TextNode).value === exact;
}

/**
 * Minimal parsing for something like `url "Title"` or `<url> "Title"`.
 * Adjust as needed for your use-cases.
 */
function parseUrlAndTitle(raw: string): { url: string; title: string } {
  let trimmed = raw.trim();

  // If URL is wrapped like <...>, remove outer < >
  if (trimmed.startsWith("<") && trimmed.includes(">")) {
    const endIdx = trimmed.lastIndexOf(">");
    const inside = trimmed.slice(1, endIdx).trim();
    const remainder = trimmed.slice(endIdx + 1).trim();
    trimmed = inside + (remainder ? " " + remainder : "");
  }

  let url = trimmed;
  let title = "";
  // Look for “url \"Title\"” or “url 'Title'”
  const re = /^(\S+)\s+["'](.*)["']$/;
  const m = trimmed.match(re);
  if (m) {
    url = m[1];
    title = m[2];
  }

  return { url, title };
}