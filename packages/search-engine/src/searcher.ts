import { tokenize } from "./indexer";
import type { SearchIndex, DocumentMap, SearchResult, DocID } from "./types";

function levenshteinDistance(a: string, b: string): number {
  const lengthA = a.length;
  const lengthB = b.length;
  if (!lengthA) return lengthB;
  if (!lengthB) return lengthA;
  const matrix = Array.from({ length: lengthA + 1 }, () => new Array(lengthB + 1).fill(0));
  for (let indexA = 0; indexA <= lengthA; indexA++) {
    matrix[indexA][0] = indexA;
  }
  for (let indexB = 0; indexB <= lengthB; indexB++) {
    matrix[0][indexB] = indexB;
  }
  for (let indexA = 1; indexA <= lengthA; indexA++) {
    for (let indexB = 1; indexB <= lengthB; indexB++) {
      const cost = a[indexA - 1] === b[indexB - 1] ? 0 : 1;
      matrix[indexA][indexB] = Math.min(
        matrix[indexA - 1][indexB] + 1,
        matrix[indexA][indexB - 1] + 1,
        matrix[indexA - 1][indexB - 1] + cost
      );
    }
  }
  return matrix[lengthA][lengthB];
}

interface BKNode {
  token: string;
  children: Map<number, BKNode>;
}

function buildBKTree(tokens: string[]): BKNode | null {
  if (!tokens.length) return null;
  const root: BKNode = { token: tokens[0], children: new Map() };
  for (let i = 1; i < tokens.length; i++) {
    insertToken(root, tokens[i]);
  }
  return root;
}

function insertToken(node: BKNode, token: string): void {
  const distance = levenshteinDistance(node.token, token);
  const childNode = node.children.get(distance);
  if (!childNode) {
    node.children.set(distance, { token, children: new Map() });
  } else {
    insertToken(childNode, token);
  }
}

function searchBKTree(node: BKNode | null, query: string, maximumDistance: number, found: string[]): void {
  if (!node) return;
  const distance = levenshteinDistance(query, node.token);
  if (distance <= maximumDistance) {
    found.push(node.token);
  }
  const lower = distance - maximumDistance;
  const upper = distance + maximumDistance;
  for (const [childDistance, childNode] of node.children.entries()) {
    if (childDistance >= lower && childDistance <= upper) {
      searchBKTree(childNode, query, maximumDistance, found);
    }
  }
}

export function searchFuzzy(
  query: string,
  index: SearchIndex,
  docMap: DocumentMap,
  maxDistance: number = 1
): SearchResult[] {
  const queryTokens = tokenize(query);
  if (!queryTokens.length) return [];
  const allIndexTokens = Object.keys(index);
  const root = buildBKTree(allIndexTokens);
  const scores = new Map<DocID, number>();
  for (const queryToken of queryTokens) {
    const matchedTokens = new Set<string>();
    for (const existingToken of allIndexTokens) {
      if (existingToken.toLowerCase().includes(queryToken.toLowerCase())) {
        matchedTokens.add(existingToken);
      }
    }
    const fuzzyFound: string[] = [];
    searchBKTree(root, queryToken, maxDistance, fuzzyFound);
    for (const match of fuzzyFound) {
      matchedTokens.add(match);
    }
    for (const token of matchedTokens) {
      const documents = index[token];
      for (const [docId, frequency] of documents.entries()) {
        const current = scores.get(docId) || 0;
        scores.set(docId, current + frequency);
      }
    }
  }
  const results: SearchResult[] = [];
  for (const [docId, score] of scores.entries()) {
    results.push({ docId, filePath: docMap[docId], score });
  }
  results.sort((a, b) => b.score - a.score);
  return results;
}

export { levenshteinDistance, buildBKTree, insertToken, searchBKTree };