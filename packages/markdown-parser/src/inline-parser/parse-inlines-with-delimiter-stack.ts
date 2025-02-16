import type {
  RefDefinition,
  MarkdownNode,
  TextNode,
  LinkNode,
  ImageNode,
} from "@/ast"
import { type InlineToken } from "@/inline-parser"

export function parseInlinesWithDelimiterStack(
  inlineTokens: InlineToken[],
  referenceMap: Map<string, RefDefinition>
): MarkdownNode[] {
  const immediateNodes: MarkdownNode[] = []
  const possibleDelimiters: {
    idx: number
    length: number
    char: string
    canOpen: boolean
    canClose: boolean
  }[] = []

  for (let index = 0; index < inlineTokens.length; index++) {
    const currentToken = inlineTokens[index]
    switch (currentToken.type) {
      case "code_span":
        immediateNodes.push({ type: "code_span", code: currentToken.content })
        break
      case "raw_html":
        immediateNodes.push({ type: "raw_html", content: currentToken.content })
        break
      case "autolink": {
        const contentValue = currentToken.content
        const emailForm = /^[^\s@]+@[^\s@]+$/.test(contentValue)
        let linkUrl = contentValue
        if (emailForm) linkUrl = "mailto:" + linkUrl
        immediateNodes.push({
          type: "link",
          url: linkUrl,
          children: [{ type: "text", value: contentValue }],
        })
        break
      }
      case "softbreak":
        immediateNodes.push({ type: "text", value: " " })
        break
      case "br":
        immediateNodes.push({ type: "linebreak" })
        break
      case "delim": {
        const runCharacter = currentToken.content[0]
        const runLength = currentToken.content.length
        const previousToken = inlineTokens[index - 1]
        const nextToken = inlineTokens[index + 1]
        const previousChar = previousToken ? lastCharacterOf(previousToken.content) : ""
        const nextChar = nextToken ? firstCharacterOf(nextToken.content) : ""
        const openCheck = isLeftFlankingDelimiterRun(
          runCharacter,
          previousChar,
          nextChar,
          runLength
        )
        const closeCheck = isRightFlankingDelimiterRun(
          runCharacter,
          previousChar,
          nextChar,
          runLength
        )
        const nodePosition = immediateNodes.length
        immediateNodes.push({ type: "text", value: currentToken.content })
        possibleDelimiters.push({
          idx: nodePosition,
          length: runLength,
          char: runCharacter,
          canOpen: openCheck,
          canClose: closeCheck,
        })
        break
      }
      default:
        immediateNodes.push({ type: "text", value: currentToken.content })
        break
    }
  }

  const bracketParsedNodes = parseLinksAndImages(immediateNodes, referenceMap)
  const freshDelims: {
    idx: number
    length: number
    char: string
    canOpen: boolean
    canClose: boolean
  }[] = []

  for (let i = 0; i < bracketParsedNodes.length; i++) {
    const potentialNode = bracketParsedNodes[i]
    if (potentialNode.type === "text") {
      const textValue = potentialNode.value
      if (/^[*_]+$/.test(textValue)) {
        const markChar = textValue[0]
        const markLen = textValue.length
        const previousNodeChar = i > 0 ? lastCharacterOfNode(bracketParsedNodes[i - 1]) : ""
        const nextNodeChar =
          i < bracketParsedNodes.length - 1 ? firstCharacterOfNode(bracketParsedNodes[i + 1]) : ""
        const canOpen = isLeftFlankingDelimiterRun(
          markChar,
          previousNodeChar,
          nextNodeChar,
          markLen
        )
        const canClose = isRightFlankingDelimiterRun(
          markChar,
          previousNodeChar,
          nextNodeChar,
          markLen
        )
        freshDelims.push({
          idx: i,
          length: markLen,
          char: markChar,
          canOpen,
          canClose,
        })
      }
    }
  }

  processEmphasis(bracketParsedNodes, freshDelims)
  return bracketParsedNodes
}

function parseLinksAndImages(
  nodeList: MarkdownNode[],
  referenceMap: Map<string, RefDefinition>
): MarkdownNode[] {
  const bracketOpeners: { index: number; image: boolean }[] = []

  function textNodeCheck(node: MarkdownNode, checkValue: string) {
    return node.type === "text" && node.value === checkValue
  }

  function precedingExclamationCheck(collection: MarkdownNode[], position: number) {
    if (position < 1) return false
    return textNodeCheck(collection[position - 1], "!")
  }

  for (let i = 0; i < nodeList.length; i++) {
    const node = nodeList[i]
    if (!node) continue
    if (textNodeCheck(node, "[")) {
      const maybeImage = precedingExclamationCheck(nodeList, i)
      bracketOpeners.push({ index: i, image: maybeImage })
      continue
    }
    if (textNodeCheck(node, "]")) {
      if (!bracketOpeners.length) continue
      const popped = bracketOpeners.pop()!
      let openerPosition = popped.index
      const isImage = popped.image
      if (isImage && openerPosition > 0) {
        if (textNodeCheck(nodeList[openerPosition - 1], "!")) {
          nodeList.splice(openerPosition - 1, 1)
          i--
          openerPosition--
        }
      }
      const labelContents = nodeList.slice(openerPosition + 1, i)
      const bracketQuantity = i - openerPosition + 1
      const bracketData = nodeList.splice(openerPosition, bracketQuantity)
      i = openerPosition - 1
      if (i < -1) i = -1
      if (!labelContents.length) {}
      const potentialNext = nodeList[openerPosition]
      if (potentialNext && textNodeCheck(potentialNext, "(")) {
        nodeList.splice(openerPosition, 1)
        i--
        let foundRightParen = -1
        for (let finder = openerPosition; finder < nodeList.length; finder++) {
          if (textNodeCheck(nodeList[finder], ")")) {
            foundRightParen = finder
            break
          }
        }
        if (foundRightParen === -1) {
          nodeList.splice(openerPosition, 0, ...bracketData)
          i += bracketData.length
          continue
        }
        const insideParens = nodeList.slice(openerPosition, foundRightParen)
        nodeList.splice(openerPosition, foundRightParen - openerPosition + 1)
        i -= foundRightParen - openerPosition
        const parsed = parseDestination(insideParens)
        if (!parsed.url) {
          nodeList.splice(openerPosition, 0, ...bracketData)
          i += bracketData.length
          continue
        }
        if (isImage) {
          const imageNode: ImageNode = {
            type: "image",
            url: parsed.url,
            alt: gatherPlainText(labelContents),
            title: parsed.title || "",
          }
          nodeList.splice(openerPosition, 0, imageNode)
          i--
          continue
        }
        const linkNode: LinkNode = {
          type: "link",
          url: parsed.url,
          title: parsed.title || "",
          children: labelContents.length
            ? labelContents
            : [{ type: "text", value: "" }],
        }
        nodeList.splice(openerPosition, 0, linkNode)
        i--
        continue
      } else if (potentialNext && textNodeCheck(potentialNext, "[")) {
        nodeList.splice(openerPosition, 1)
        i--
        let matchingClose = -1
        for (let finder = openerPosition; finder < nodeList.length; finder++) {
          if (textNodeCheck(nodeList[finder], "]")) {
            matchingClose = finder
            break
          }
        }
        if (matchingClose === -1) {
          nodeList.splice(openerPosition, 0, ...bracketData)
          i += bracketData.length
          continue
        }
        const secondLabel = nodeList.slice(openerPosition, matchingClose)
        nodeList.splice(openerPosition, matchingClose - openerPosition + 1)
        i -= matchingClose - openerPosition
        const secondLabelString = gatherPlainText(secondLabel).trim() || ""
        const normalizedKey = secondLabelString.toLowerCase()
        let foundDef = referenceMap.get(normalizedKey)
        if (!secondLabelString) {
          const mainLabel = gatherPlainText(labelContents).toLowerCase()
          foundDef = referenceMap.get(mainLabel) || undefined
          if (!foundDef) {
            nodeList.splice(openerPosition, 0, ...bracketData)
            i += bracketData.length
            continue
          }
          if (isImage) {
            const newImage: ImageNode = {
              type: "image",
              url: foundDef.url,
              alt: gatherPlainText(labelContents),
              title: foundDef.title || "",
            }
            nodeList.splice(openerPosition, 0, newImage)
            i--
            continue
          }
          const newLink: LinkNode = {
            type: "link",
            url: foundDef.url,
            title: foundDef.title || "",
            children: labelContents,
          }
          nodeList.splice(openerPosition, 0, newLink)
          i--
          continue
        } else {
          if (!foundDef) {
            nodeList.splice(openerPosition, 0, ...bracketData)
            i += bracketData.length
            continue
          }
          if (isImage) {
            const newImage: ImageNode = {
              type: "image",
              url: foundDef.url,
              alt: gatherPlainText(labelContents),
              title: foundDef.title || "",
            }
            nodeList.splice(openerPosition, 0, newImage)
            i--
            continue
          }
          const newLink: LinkNode = {
            type: "link",
            url: foundDef.url,
            title: foundDef.title || "",
            children: labelContents,
          }
          nodeList.splice(openerPosition, 0, newLink)
          i--
          continue
        }
      } else {
        const labelString = gatherPlainText(labelContents)
        const possibleRef = referenceMap.get(labelString.toLowerCase())
        if (possibleRef) {
          if (isImage) {
            const refImage: ImageNode = {
              type: "image",
              url: possibleRef.url,
              alt: labelString,
              title: possibleRef.title || "",
            }
            nodeList.splice(openerPosition, 0, refImage)
            i--
            continue
          } else {
            const refLink: LinkNode = {
              type: "link",
              url: possibleRef.url,
              title: possibleRef.title || "",
              children: labelContents,
            }
            nodeList.splice(openerPosition, 0, refLink)
            i--
            continue
          }
        } else {
          nodeList.splice(openerPosition, 0, ...bracketData)
          i += bracketData.length
        }
      }
    }
  }

  return nodeList
}

function parseDestination(pieceNodes: MarkdownNode[]): { url: string; title?: string } {
  const textValue = gatherPlainText(pieceNodes).trim()
  if (!textValue) return { url: "" }
  let url = ""
  let title = ""
  if (textValue[0] === "<") {
    const lastAngle = textValue.lastIndexOf(">")
    if (lastAngle > 0) {
      url = textValue.slice(1, lastAngle).trim()
      const remainder = textValue.slice(lastAngle + 1).trim()
      if (remainder) {
        const maybeQuoted = parseQuotedTitle(remainder)
        if (maybeQuoted !== null) {
          title = maybeQuoted
        }
      }
    } else {
      return { url: "" }
    }
  } else {
    const spaceIndex = textValue.search(/\s/)
    if (spaceIndex === -1) {
      url = textValue
    } else {
      url = textValue.slice(0, spaceIndex)
      const leftover = textValue.slice(spaceIndex).trim()
      const maybeQuoted = parseQuotedTitle(leftover)
      if (maybeQuoted !== null) {
        title = maybeQuoted
      }
    }
  }
  url = url.trim()
  return { url, title }
}

function parseQuotedTitle(textValue: string): string | null {
  const trimmed = textValue.trim()
  if (!trimmed) return null
  if (trimmed[0] === '"') {
    const lastQuote = trimmed.lastIndexOf('"')
    if (lastQuote > 0) {
      return trimmed.slice(1, lastQuote)
    }
  }
  return null
}

function gatherPlainText(nodes: MarkdownNode[]): string {
  let output = ""
  for (const item of nodes) {
    if (item.type === "text") {
      output += item.value
    } else if (item.type === "code_span") {
      output += item.code
    } else if ("children" in item && item.children) {
      output += gatherPlainText(item.children)
    }
  }
  return output
}

export function processEmphasis(
  nodes: MarkdownNode[],
  delims: {
    idx: number
    length: number
    char: string
    canOpen: boolean
    canClose: boolean
  }[]
) {
  delims.sort((a, b) => a.idx - b.idx)
  const usedIndices = new Set<number>()

  for (let closerPos = delims.length - 1; closerPos >= 0; closerPos--) {
    if (usedIndices.has(closerPos)) continue
    const closer = delims[closerPos]
    if (!closer.canClose) continue

    for (let openerPos = closerPos - 1; openerPos >= 0; openerPos--) {
      if (usedIndices.has(openerPos)) continue
      const opener = delims[openerPos]
      if (!opener.canOpen) continue
      if (opener.char !== closer.char) continue

      let matchedQuantity = Math.min(opener.length, closer.length)
      if (matchedQuantity > 3) {
        matchedQuantity = 3
      }
      const isStrong = matchedQuantity >= 2
      const leftover = isStrong ? matchedQuantity - 2 : matchedQuantity - 1

      usedIndices.add(openerPos)
      usedIndices.add(closerPos)

      const openerIndex = opener.idx
      let closerIndex = closer.idx

      const openerNode = nodes[openerIndex] as TextNode
      const closerNode = nodes[closerIndex] as TextNode

      if (openerNode.value.length < matchedQuantity) openerNode.value = ""
      else openerNode.value = openerNode.value.slice(
        0,
        openerNode.value.length - matchedQuantity
      )

      if (closerNode.value.length < matchedQuantity) closerNode.value = ""
      else closerNode.value = closerNode.value.slice(matchedQuantity)

      let startIndex = Math.min(openerIndex, closerIndex) + 1
      let endIndex = Math.max(openerIndex, closerIndex) - 1
      if (endIndex < startIndex) break
      if (startIndex < 0) startIndex = 0
      if (endIndex >= nodes.length) endIndex = nodes.length - 1
      const middleContent = nodes.slice(startIndex, endIndex + 1)

      let emphasisNode: MarkdownNode = {
        type: isStrong ? "strong" : "emphasis",
        children: middleContent,
      }

      if (leftover === 1) {
        emphasisNode = {
          type: "strong",
          children: [
            {
              type: "emphasis",
              children: middleContent,
            },
          ],
        }
      }

      nodes.splice(startIndex, middleContent.length, emphasisNode)

      if (!openerNode.value) {
        nodes.splice(openerIndex, 1)
        adjustDelimiterIndexes(delims, openerIndex)
        if (closerIndex > openerIndex) {
          closerIndex--
        }
      }

      if (!closerNode.value) {
        nodes.splice(closerIndex, 1)
        adjustDelimiterIndexes(delims, closerIndex)
      }

      for (let z = 0; z < delims.length; z++) {
        if (usedIndices.has(z)) continue
        const d = delims[z]
        if (d.idx > startIndex + middleContent.length - 1) {
          d.idx -= middleContent.length - 1
        } else if (d.idx >= startIndex) {
          usedIndices.add(z)
        }
      }
      break
    }
  }
}

export function adjustDelimiterIndexes(delims: any[], removedIdx: number) {
  for (let i = 0; i < delims.length; i++) {
    if (delims[i].idx === removedIdx) {
      delims.splice(i, 1)
      i--
    }
  }
  for (let i = 0; i < delims.length; i++) {
    if (delims[i].idx > removedIdx) {
      delims[i].idx--
    }
  }
}

export function isRightFlankingDelimiterRun(
  runChar: string,
  previousChar: string,
  nextChar: string,
  runLen: number
): boolean {
  if (runChar === "*") {
    return !!previousChar && !/\s/.test(previousChar)
  }
  if (runChar === "_") {
    if (!previousChar || /\s/.test(previousChar)) return false
    if (/[a-zA-Z0-9]/.test(previousChar) && nextChar && /[a-zA-Z0-9]/.test(nextChar)) {
      return false
    }
    return true
  }
  return false
}

export function isLeftFlankingDelimiterRun(
  runChar: string,
  previousChar: string,
  nextChar: string,
  runLen: number
): boolean {
  if (runChar === "*") {
    return !!nextChar && !/\s/.test(nextChar)
  }
  if (runChar === "_") {
    if (nextChar === "_" || !nextChar || /\s/.test(nextChar)) return false
    if (/[a-zA-Z0-9]/.test(nextChar)) {
      if (/[a-zA-Z0-9]/.test(previousChar || "")) return false
    }
    return true
  }
  return false
}

function lastCharacterOf(str: string): string {
  return str ? str[str.length - 1] : ""
}
function firstCharacterOf(str: string): string {
  return str ? str[0] : ""
}
function lastCharacterOfNode(node: MarkdownNode): string {
  if (node.type === "text") return lastCharacterOf(node.value)
  return ""
}
function firstCharacterOfNode(node: MarkdownNode): string {
  if (node.type === "text") return firstCharacterOf(node.value)
  return ""
}