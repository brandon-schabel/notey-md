import type { SearchIndex } from "./types";

/**
 * Computes the term frequency for an array of tokens.
 * Always lowercases tokens so that "Hello" and "hello" merge into "hello".
 */
export function computeTermFrequency(tokens: string[]): Record<string, number> {
  const frequencyMap: Record<string, number> = {};
  for (const token of tokens) {
    const lowerToken = token.toLowerCase();
    frequencyMap[lowerToken] = (frequencyMap[lowerToken] || 0) + 1;
  }
  return frequencyMap;
}

/**
 * Strips Markdown syntax, including:
 * - Code blocks
 * - Inline code
 * - Images / custom math tags
 * - Links (but keeps link text)
 * - Bold/italic markers
 * - Heading markers
 * - Blockquotes
 * - Horizontal rules
 */
export function extractPlainText(markdown: string): string {
  let text = markdown;

  // 1) Remove code blocks (including possible leading spaces)
  text = text.replace(/^\s*```[\s\S]*?```\s*/gm, "");

  // 2) Remove inline code markers but keep code text
  text = text.replace(/`([^`]+)`/g, "$1");

  // 3) Remove images or custom math tags entirely
  text = text.replace(/!\$begin:math:display\$[\s\S]*?\$end:math:display\$\$begin:math:text\$[\s\S]*?\$end:math:text\$/g, "");

  // 4) Remove custom "math link" style but keep the display text
  text = text.replace(/\$begin:math:display\$([\s\S]*?)\$end:math:display\$\$begin:math:text\$[\s\S]*?\$end:math:text\$/g, "$1");

  // 4b) Remove standard Markdown links but keep their display text
  // (Adjust this pattern if you store actual links differently)
  text = text.replace(/$begin:math:display$([^$end:math:display$]+)\]$begin:math:text$[^)]*$end:math:text$/g, "$1");

  // 5) Remove bold/italic markers but keep inner text
  text = text.replace(/(\*{1,3})(.*?)\1/g, "$2");
  text = text.replace(/(_{1,3})(.*?)\1/g, "$2");

  // 6) Remove heading markers
  text = text.replace(/^\s*#{1,6}\s+/gm, "");

  // 7) Remove blockquote '>' markers
  text = text.replace(/^\s*>\s*/gm, "");

  // 8) Remove horizontal rules (---, ***)
  text = text.replace(/^\s*[-*]{3,}\s*$/gm, "");

  // 9) Trim extra whitespace
  text = text.trim();

  return text;
}

/**
 * Tokenizes text by splitting on non-alphanumeric.
 * Lowercases and filters out short tokens (<2 chars).
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((t) => t.length > 1);
}

/**
 * Builds the search index for a single file.
 * - Removes old tokens for that docId
 * - Extracts plain text from markdown
 * - Tokenizes
 * - Computes frequency
 * - Updates the index
 */
export function buildIndexForFile(
  markdownContent: string,
  docId: number,
  index: SearchIndex
): void {
  try {
    // Remove old references for this docId first
    removeDocFromIndex(docId, index);

    const plainText = extractPlainText(markdownContent);
    const tokens = tokenize(plainText);
    const frequencyMap = computeTermFrequency(tokens);

    // Merge frequencies into the index
    for (const [token, freq] of Object.entries(frequencyMap)) {
      if (!index[token]) {
        index[token] = new Map();
      }
      index[token].set(docId, freq);
    }
  } catch (error) {
    console.error(`Error indexing document ${docId}:`, error);
  }
}

/**
 * Removes a document from the index.
 * Also removes any token entry entirely if it no longer has any doc references.
 */
export function removeDocFromIndex(
  docId: number,
  index: SearchIndex
): void {
  try {
    for (const token in index) {
      const docMap = index[token];
      if (docMap.has(docId)) {
        docMap.delete(docId);
        if (docMap.size === 0) {
          delete index[token];
        }
      }
    }
  } catch (error) {
    console.error(`Error removing document ${docId} from index:`, error);
  }
}