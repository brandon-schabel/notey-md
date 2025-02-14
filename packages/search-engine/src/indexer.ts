import type { SearchIndex } from "./types";

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
  //    This uses a multiline regex (^ ... gm) plus `[\s\S]` to match all content in between.
  text = text.replace(/^\s*```[\s\S]*?```\s*/gm, "");

  // 2) Remove inline code markers but keep code text
  //    e.g. "This is `inline code`" => "This is inline code"
  text = text.replace(/`([^`]+)`/g, "$1");

  // 3) Remove images or custom math tags entirely
  //    (You might want to separate "standard images" like ![alt](url) from custom math blocks, but this is a placeholder.)
  //    We match !\$begin:math:display\$...\$end:math:text\$ across multiple lines if needed.
  text = text.replace(/!\$begin:math:display\$[\s\S]*?\$end:math:display\$\$begin:math:text\$[\s\S]*?\$end:math:text\$/g, "");

  // 4) Remove custom "math link" style but keep the display text:
  //    e.g. "$begin:math:display$Google$end:math:display$$begin:math:text$(https://google.com)$end:math:text$" => "Google"
  text = text.replace(/\$begin:math:display\$([\s\S]*?)\$end:math:display\$\$begin:math:text\$[\s\S]*?\$end:math:text\$/g, "$1");

  // 4b) Remove standard Markdown links but keep their display text:
  //     e.g. "[Google](https://google.com)" => "Google"
  text = text.replace(/$begin:math:display$([^$end:math:display$]+)\]$begin:math:text$[^)]*$end:math:text$/g, "$1");

  // 5) Remove bold/italic markers: **, __, *, _ (single, double, triple),
  //    but keep the inner text
  text = text.replace(/(\*{1,3})(.*?)\1/g, "$2");
  text = text.replace(/(_{1,3})(.*?)\1/g, "$2");

  // 6) Remove heading markers (allowing leading spaces). 
  //    e.g. "   # Heading 1" => "Heading 1"
  text = text.replace(/^\s*#{1,6}\s+/gm, "");

  // 7) Remove blockquote '>' markers (allowing leading spaces).
  //    e.g. "   > A quote" => "A quote"
  text = text.replace(/^\s*>\s*/gm, "");

  // 8) Remove horizontal rules like --- or ***
  //    e.g. "   --- " or " *** " on a line by itself => ""
  text = text.replace(/^\s*[-*]{3,}\s*$/gm, "");

  // 9) Trim extra whitespace overall
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
 * Adds or refreshes this docId's tokens in the index.
 *  - Removes old tokens for docId first (so we don't accumulate stale entries).
 *  - Then extracts tokens from the new content.
 */
export function buildIndexForFile(
  markdownContent: string,
  docId: number,
  index: SearchIndex
): void {
  // 1) Remove any old references to docId
  removeDocFromIndex(docId, index);

  // 2) Extract fresh tokens
  const text = extractPlainText(markdownContent);
  const tokens = tokenize(text);

  // 3) Count frequency
  const frequencyMap: Record<string, number> = {};
  for (const token of tokens) {
    frequencyMap[token] = (frequencyMap[token] || 0) + 1;
  }

  // 4) Merge frequencies into the index
  for (const [token, freq] of Object.entries(frequencyMap)) {
    if (!index[token]) {
      index[token] = new Map();
    }
    index[token].set(docId, freq);
  }
}

/**
 * Removes all occurrences of docId from the index
 * (used before re-indexing a doc or after deletion).
 */
export function removeDocFromIndex(
  docId: number,
  index: SearchIndex
): void {
  for (const [token, docMap] of Object.entries(index)) {
    if (docMap.has(docId)) {
      docMap.delete(docId);
      // If no docs remain for this token, remove the token entirely
      if (docMap.size === 0) {
        delete index[token];
      }
    }
  }
}