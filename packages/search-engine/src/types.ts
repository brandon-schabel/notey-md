export type DocID = number;

/**
 * SearchIndex
 * Maps "word" => { docId -> frequency }
 */
export interface SearchIndex {
  [word: string]: Map<DocID, number>;
}

/**
 * DocumentMap
 * Maps docId -> filePath for retrieving original file name
 */
export interface DocumentMap {
  [docId: number]: string;
}

/**
 * ReverseDocMap
 * Maps filePath -> docId for quick lookups when a file changes
 */
export interface ReverseDocMap {
  [filePath: string]: number;
}

export interface SearchResult {
  docId: number;
  filePath: string;
  score: number;
}