import type { SearchIndex, DocumentMap, ReverseDocMap, SearchResult } from "./types";
import { buildIndexForFile, removeDocFromIndex } from "./indexer";
import { searchFuzzy } from "./searcher";

export class SearchEngine {
    private index: SearchIndex = {};
    private docMap: DocumentMap = {};
    private reverseDocMap: ReverseDocMap = {};
    private nextDocId = 1;

    /**
     * Adds or updates a file in the search index.
     * If the file already exists, remove old references, then rebuild for new content.
     */
    public addOrUpdateDocument(filePath: string, markdownContent: string): void {
        // If doc already exists, remove it first (so we can re-index cleanly).
        if (this.reverseDocMap[filePath] != null) {
            const existingDocId = this.reverseDocMap[filePath];
            removeDocFromIndex(existingDocId, this.index);
        } else {
            // brand new doc => assign a new docId
            this.reverseDocMap[filePath] = this.nextDocId;
            this.docMap[this.nextDocId] = filePath;
            this.nextDocId++;
        }

        const docId = this.reverseDocMap[filePath];
        buildIndexForFile(markdownContent, docId, this.index);
    }

    /**
     * Removes a document (e.g. if deleted).
     */
    public removeDocument(filePath: string): void {
        const docId = this.reverseDocMap[filePath];
        if (docId != null) {
            removeDocFromIndex(docId, this.index);
            delete this.docMap[docId];
            delete this.reverseDocMap[filePath];
        }
    }

    /**
     * Exact search by default; you can add a fuzzy version or an option param here if needed.
     */
    public search(query: string): SearchResult[] {
        return searchFuzzy(query, this.index, this.docMap);
    }

    /**
     * (Optional) Convert entire index to JSON for caching on disk.
     */
    public toJSON(): any {
        const indexObject: Record<string, Array<[number, number]>> = {};
        for (const [word, docMap] of Object.entries(this.index)) {
            indexObject[word] = Array.from((docMap as Map<number, number>).entries()); // [ [docId, freq], ...]
        }
        return {
            index: indexObject,
            docMap: this.docMap,
            reverseDocMap: this.reverseDocMap,
            nextDocId: this.nextDocId
        };
    }

    /**
     * (Optional) Load entire index from JSON (reverse of toJSON()).
     */
    public fromJSON(data: any): void {
        this.index = {};
        for (const [word, arr] of Object.entries(data.index)) {
            // arr is [ [docId, freq], ...]
            this.index[word] = new Map(arr as [number, number][]); // Explicit type assertion
        }
        this.docMap = data.docMap;
        this.reverseDocMap = data.reverseDocMap;
        this.nextDocId = data.nextDocId;
    }
}