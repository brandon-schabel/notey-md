import { describe, it, expect, beforeEach } from "bun:test";
import { SearchEngine } from "./search-engine";
import type { SearchResult } from "./types";

describe("SearchEngine", () => {
    let engine: SearchEngine;

    beforeEach(() => {
        // Re-create a fresh engine for each test
        engine = new SearchEngine();
    });

    describe("addOrUpdateDocument", () => {
        it("adds a new document to the index", () => {
            const filePath = "test1.md";
            const content = "Hello world";

            engine.addOrUpdateDocument(filePath, content);

            // Searching for 'Hello' or 'world' should yield results from doc test1.md
            const resultsHello = engine.search("hello");
            const resultsWorld = engine.search("world");
            expect(resultsHello).toHaveLength(1);
            expect(resultsHello[0].filePath).toBe(filePath);
            expect(resultsWorld).toHaveLength(1);
            expect(resultsWorld[0].filePath).toBe(filePath);
        });

        it("updates an existing document, removing old references", () => {
            const filePath = "test2.md";
            const oldContent = "cat dog";
            const newContent = "cat mouse";

            // Add initial doc
            engine.addOrUpdateDocument(filePath, oldContent);
            // Confirm "dog" can be found
            let results = engine.search("dog");
            expect(results).toHaveLength(1);

            // Update doc to remove "dog" and add "mouse"
            engine.addOrUpdateDocument(filePath, newContent);

            // Now "dog" should not appear; "mouse" should appear instead
            results = engine.search("dog");
            expect(results).toHaveLength(0);
            results = engine.search("mouse");
            expect(results).toHaveLength(1);
            expect(results[0].filePath).toBe(filePath);
        });
    });

    describe("removeDocument", () => {
        it("removes an existing document from the index", () => {
            const filePath = "test3.md";
            const content = "cat dog";

            engine.addOrUpdateDocument(filePath, content);
            // Confirm we can find "cat"
            let results = engine.search("cat");
            expect(results).toHaveLength(1);

            // Remove the document
            engine.removeDocument(filePath);
            // Searching for "cat" or "dog" should yield no results
            results = engine.search("cat");
            expect(results).toHaveLength(0);
            results = engine.search("dog");
            expect(results).toHaveLength(0);
        });

        it("ignores removing a document that doesn't exist", () => {
            // This should not throw an error
            engine.removeDocument("non-existent-file.md");
            // Ensure we still run
            expect(true).toBe(true);
        });
    });

    describe("search (fuzzy)", () => {
        it("returns empty array when query is empty", () => {
            const results = engine.search("");
            expect(Array.isArray(results)).toBe(true);
            expect(results).toHaveLength(0);
        });

        it("performs fuzzy matching", () => {
            // We'll add a couple docs that contain close words
            engine.addOrUpdateDocument("test4.md", "Hello word");
            engine.addOrUpdateDocument("test5.md", "Help the world");
            engine.addOrUpdateDocument("test6.md", "Helmet worn out");

            // Searching 'helo' or 'hellp' might match "Hello" or "Help" or "Helmet" with small edit distance
            // Because your underlying searchFuzzy defaults to maxDistance=1, these small differences should match
            let results = engine.search("helo");
            // Should match "Hello" from test4.md (and possibly "Help" from test5.md or "Helmet" from test6.md if distance <= 1)
            expect(results.length).toBeGreaterThan(0);

            // Searching 'word' might also match "world"
            results = engine.search("word");
            // "Hello word" (exact match)
            // "Help the world" (fuzzy match 'word' -> 'world' distance=1?), 
            // "Helmet worn" => 'word' vs 'worn' or 'helmet'? 
            expect(results.length).toBeGreaterThan(0);
        });

        it("ranks higher-frequency documents first", () => {
            // docA has "cat" repeated 3 times, docB has it 1 time
            engine.addOrUpdateDocument("docA.md", "cat cat cat");
            engine.addOrUpdateDocument("docB.md", "cat dog");

            const results = engine.search("cat");
            expect(results[0].filePath).toBe("docA.md");
            expect(results[1].filePath).toBe("docB.md");
        });
    });

    describe("JSON serialization", () => {
        it("can serialize and deserialize the search index", () => {
            // Add some documents
            engine.addOrUpdateDocument("test1.md", "Hello world");
            engine.addOrUpdateDocument("test2.md", "Hello cat");
            const resultsBefore = engine.search("hello");
            expect(resultsBefore).toHaveLength(2);

            // Serialize
            const data = engine.toJSON();

            // Create a fresh engine, load from JSON
            const newEngine = new SearchEngine();
            newEngine.fromJSON(data);

            // The new engine should return the same search results
            const resultsAfter = newEngine.search("hello");
            expect(resultsAfter).toHaveLength(2);

            // They should match the file paths of the original
            const filePathsBefore = resultsBefore.map((r) => r.filePath).sort();
            const filePathsAfter = resultsAfter.map((r) => r.filePath).sort();
            expect(filePathsAfter).toEqual(filePathsBefore);
        });
    });
});