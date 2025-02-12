import type { MarkdownNode, DocumentNode, RefDefinition, TextNode } from "./ast";
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

export function parseInlinesWithDelimiterStack(tokens: InlineToken[], refMap: Map<string, RefDefinition>): MarkdownNode[] {
  const nodes: MarkdownNode[] = []
  const delims: {
    idx: number
    length: number
    char: string
    canOpen: boolean
    canClose: boolean
  }[] = []

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    switch (t.type) {
      case "code_span":
        nodes.push({ type: "code_span", code: t.content })
        break
      case "raw_html":
        nodes.push({ type: "raw_html", content: t.content })
        break
      case "autolink":
        {
          const c = t.content
          const isEmail = /^[^\s@]+@[^\s@]+$/.test(c)
          let url = c
          if (isEmail) url = "mailto:" + url
          nodes.push({ type: "link", url, children: [{ type: "text", value: t.content }] })
        }
        break
      case "softbreak":
        nodes.push({ type: "text", value: " " })
        break
      case "br":
        nodes.push({ type: "linebreak" })
        break
      case "delim": {
        const runChar = t.content[0]
        const runLen = t.content.length
        const lastChar = i > 0 ? tokens[i - 1].content.slice(-1) : ""
        const nextChar = i < tokens.length - 1 ? tokens[i + 1].content.slice(0, 1) : ""
        const canOpen = isLeftFlankingDelimiterRun(runChar, lastChar, nextChar, runLen)
        const canClose = isRightFlankingDelimiterRun(runChar, lastChar, nextChar, runLen)
        const textNode: TextNode = { type: "text", value: t.content }
        const nodeIndex = nodes.length
        nodes.push(textNode)
        delims.push({ idx: nodeIndex, length: runLen, char: runChar, canOpen, canClose })
        break
      }
      default:
        nodes.push({ type: "text", value: t.content })
        break
    }
  }
  processEmphasis(nodes, delims)
  return nodes
}

export function processEmphasis(nodes: MarkdownNode[], delims: any[]) {
  delims.sort((a, b) => a.idx - b.idx)
  const used = new Set<number>()
  for (let closerIdx = delims.length - 1; closerIdx >= 0; closerIdx--) {
    if (used.has(closerIdx)) continue
    const closer = delims[closerIdx]
    if (!closer.canClose) continue
    for (let openerIdx = closerIdx - 1; openerIdx >= 0; openerIdx--) {
      if (used.has(openerIdx)) continue
      const opener = delims[openerIdx]
      if (!opener.canOpen) continue
      if (opener.char !== closer.char) continue
      const matchedCount = Math.min(opener.length, closer.length)
      const isStrong = matchedCount >= 2
      used.add(openerIdx)
      used.add(closerIdx)
      const openerNode = nodes[opener.idx] as TextNode
      const closerNode = nodes[closer.idx] as TextNode
      const openerText = openerNode.value
      const closerText = closerNode.value
      const useCount = isStrong ? 2 : 1
      if (openerText.length <= useCount) {
        openerNode.value = ""
      } else {
        openerNode.value = openerText.slice(0, openerText.length - useCount)
      }
      if (closerText.length <= useCount) {
        closerNode.value = ""
      } else {
        closerNode.value = closerText.slice(useCount)
      }
      let start = opener.idx + 1
      let end = closer.idx - 1
      if (openerNode.value === "") {
        nodes.splice(opener.idx, 1)
        adjustDelimiterIndexes(delims, opener.idx)
        if (closer.idx > opener.idx) closer.idx--
        if (end >= opener.idx) end--
        if (start > opener.idx) start--
      }
      if (closerNode.value === "") {
        nodes.splice(closer.idx, 1)
        adjustDelimiterIndexes(delims, closer.idx)
        if (end >= closer.idx) end--
      }
      if (start < 0) start = 0
      if (end < start) continue
      if (end >= nodes.length) end = nodes.length - 1
      const content = nodes.slice(start, end + 1)
      const emph: MarkdownNode = isStrong
        ? { type: "strong", children: content }
        : { type: "emphasis", children: content }
      nodes.splice(start, content.length, emph)
      for (let di = 0; di < delims.length; di++) {
        const d = delims[di]
        if (d.idx > start + content.length - 1) {
          d.idx -= content.length - 1
        } else if (d.idx >= start) {
          used.add(di)
        }
      }
      break
    }
  }
}

export function adjustDelimiterIndexes(delims: any[], removedIndex: number) {
  for (let i = 0; i < delims.length; i++) {
    if (delims[i].idx > removedIndex) {
      delims[i].idx--
    }
  }
}

export function isLeftFlankingDelimiterRun(
  delimChar: string,
  lastChar: string,
  nextChar: string,
  runLen: number,
) {
  if (delimChar === "*") return !!nextChar && !/\s/.test(nextChar)
  else if (delimChar === "_") {
    if (nextChar === "_") return false
    if (!nextChar) return false
    if (/\s/.test(nextChar)) return false
    if (/[a-zA-Z0-9]/.test(nextChar)) {
      if (/[a-zA-Z0-9]/.test(lastChar || "")) return false
    }
    return true
  }
  return false
}

export function isRightFlankingDelimiterRun(
  delimChar: string,
  lastChar: string,
  nextChar: string,
  runLen: number,
) {
  if (delimChar === "*") return !!lastChar && !/\s/.test(lastChar)
  if (delimChar === "_") {
    if (!lastChar) return false
    if (/[a-zA-Z0-9]/.test(lastChar) && nextChar && /[a-zA-Z0-9]/.test(nextChar)) return false
    return true
  }
  return false
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

export function linkResolver(inlineNodes: MarkdownNode[], refMap: Map<string, RefDefinition>): MarkdownNode[] {
  return inlineNodes
}