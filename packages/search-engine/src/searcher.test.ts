import { describe, it, expect } from "bun:test";
import type { SearchIndex, DocumentMap } from "./types";

// We’ll test these internal utilities directly,
// but you could also mark them "export" in the module if you prefer.
import {
    levenshteinDistance,
    buildBKTree,
    insertToken,
    searchBKTree,
    searchFuzzy
} from "./searcher";

describe("levenshteinDistance", () => {
    it("returns 0 for identical strings", () => {
        expect(levenshteinDistance("hello", "hello")).toBe(0);
    });

    it("correctly computes distance for single-character difference", () => {
        expect(levenshteinDistance("cat", "cut")).toBe(1);
    });

    it("counts substitutions correctly", () => {
        expect(levenshteinDistance("saturday", "sundays")).toBe(4);
        // Explanation: "s a t u r d a y"  vs "s u n d a y s"
        // Some minimal set of edits = 4
    });

    it("correctly handles insertions", () => {
        expect(levenshteinDistance("car", "cars")).toBe(1);
        expect(levenshteinDistance("test", "testing")).toBe(3);
    });

    it("correctly handles deletions", () => {
        expect(levenshteinDistance("testing", "test")).toBe(3);
    });

    it("handles empty strings", () => {
        expect(levenshteinDistance("", "")).toBe(0);
        expect(levenshteinDistance("", "abc")).toBe(3);
        expect(levenshteinDistance("abc", "")).toBe(3);
    });
});

describe("BK-tree functions", () => {
    describe("buildBKTree", () => {
        it("returns null for empty token list", () => {
            const root = buildBKTree([]);
            expect(root).toBeNull();
        });

        it("creates a root node for a single token", () => {
            const root = buildBKTree(["hello"]);
            expect(root).not.toBeNull();
            if (root) {
                expect(root.token).toBe("hello");
                expect(root.children.size).toBe(0);
            }
        });

        it("builds a BK-tree for multiple tokens", () => {
            const tokens = ["cat", "cut", "cart", "art", "scat"];
            const root = buildBKTree(tokens);

            // We can't test the exact structure easily, but we can ensure:
            // - Non-null root
            // - The root has a token
            // - Some children are inserted
            expect(root).not.toBeNull();
            if (root) {
                expect(root.token).toBe(tokens[0]); // should be "cat"
                // For a small set like this, we can do some basic checks:
                expect(root.children.size).toBeGreaterThan(0);
            }
        });
    });

    describe("insertToken", () => {
        it("inserts a new token into an existing BK-node", () => {
            const root = buildBKTree(["cat"])!;
            insertToken(root, "cut");
            // We expect that the BK-tree for "cat" now has a child for distance=1
            const distance = levenshteinDistance("cat", "cut");
            const child = root.children.get(distance);
            expect(child).toBeDefined();
            if (child) {
                expect(child.token).toBe("cut");
            }
        });
    });

    describe("searchBKTree", () => {
        it("finds tokens within a specified distance", () => {
            const tokens = ["cat", "cut", "cart", "art", "scat", "scatter", "bat"];
            const root = buildBKTree(tokens);
            expect(root).not.toBeNull();

            const results: string[] = [];
            searchBKTree(root, "cat", 1, results);

            // "cat" (distance 0), "cut" (distance 1), "cart" (distance 1),
            // "scat" (distance 1) => these might appear, though "scat" has distance 1 or 2?
            // Let's check: "scat" vs "cat" => distance 1 if we consider insertion "s"?
            // Actually "scat" -> "cat" is a deletion or insertion, so distance=1 indeed.
            // "bat" vs "cat" => distance=1 (substitution b->c).
            // So we expect "cat", "cut", "cart", "scat", "bat" all possible if distance <= 1
            // However, "cart" may be distance 1 or 2 from "cat"? => "cat" -> "cart" = 1 insertion => distance=1
            // So we expect at least those five.
            // "scatter" is likely distance 4 or so from "cat".
            // "art" is distance 2 ("art" -> "cat" = substitution or reordering).
            // So let's check that "art" is not included if maxDistance=1.
            expect(results).toEqual(
                expect.arrayContaining(["cat", "cut", "cart", "scat", "bat"])
            );
            expect(results).not.toContain("art");
            expect(results).not.toContain("scatter");
        });

        it("handles an empty BK-node (null) gracefully", () => {
            const results: string[] = [];
            searchBKTree(null, "cat", 1, results);
            expect(results).toEqual([]);
        });
    });
});

describe("searchFuzzy", () => {
    // Minimal example "index" for testing
    // Suppose each token points to a Map of docId => frequency
    const index: SearchIndex = {
        hello: new Map([
            [0, 2],
            [1, 1],
        ]),
        hell: new Map([[1, 3]]),
        help: new Map([[2, 1]]),
        cat: new Map([[0, 1]]),
        cut: new Map([[0, 2]]),
        scatter: new Map([[3, 1]]),
    };

    // A simple docMap: docId -> filePath
    const docMap: DocumentMap = {
        0: "notes/doc0.md",
        1: "notes/doc1.md",
        2: "notes/doc2.md",
        3: "notes/doc3.md",
    };

    it("returns an empty array if the query is empty", () => {
        expect(searchFuzzy("", index, docMap, 1)).toEqual([]);
    });

    it("matches exact tokens for distance=0", () => {
        const results = searchFuzzy("hello", index, docMap, 0);
        expect(results.length).toBeGreaterThan(0);
        // We expect to see docIds [0, 1] from "hello"
        // doc0 => freq=2, doc1 => freq=1 => doc0 should appear first
        expect(results[0].docId).toBe(0);
        expect(results[1].docId).toBe(1);
        expect(results.every((r) => r.score > 0)).toBe(true);
    });

    it("finds close matches for distance=1 or 2", () => {
        // "hellp" might fuzzily match "hello" or "help"
        const results = searchFuzzy("hellp", index, docMap, 1);
        // Expect "hello" (distance=1) and "help" (distance=1)
        const matchedDocIds = results.map((r) => r.docId);
        // doc0 => from "hello" (freq=2), doc1 => from "hello" (freq=1),
        // doc2 => from "help" (freq=1).
        expect(new Set(matchedDocIds)).toEqual(new Set([0, 1, 2]));
    });

    it("combines scores from multiple fuzzy-matched tokens in the query", () => {
        // Query "helo cutt"
        //   "helo" (distance <= 1) might match "hello" or "hell"
        //   "cutt" (distance <= 1) might match "cut"
        // This ensures we combine both tokens' frequencies
        const results = searchFuzzy("helo cutt", index, docMap, 1);

        // We expect doc0 to have
        //   from "hello" freq=2 => doc0
        //   from "cut" freq=2 => doc0
        // so doc0 total freq = 4
        // doc1 might have from "hello" freq=1, from "hell" freq=3,
        // but no "cut" => total freq = 4 if it matches "hell" or "hello" from "helo"
        // doc2 might have from "help" freq=1 if matched from "helo"? (distance=1?), 
        //   but not "cut"
        // Check that doc0, doc1, doc2 appear and doc0 is top if the freq is indeed highest.
        expect(results.length).toBeGreaterThan(0);

        // Sort by descending .score (searchFuzzy already does that)
        // Let's do some quick assertions on doc0 being first if the score is indeed highest.
        expect(results[0].docId).toBe(0);
    });

    it("returns an empty array if there are no close matches", () => {
        const results = searchFuzzy("zzzzzz", index, docMap, 1);
        expect(results).toEqual([]);
    });

    it("matches partial substrings such as 'octo' for 'octoprompt'", () => {
        const index: SearchIndex = {
            octoprompt: new Map([[0, 3]]),
            randomtoken: new Map([[1, 5]])
        };
        const docMap: DocumentMap = {
            0: "notes/doc0.md",
            1: "notes/doc1.md"
        };
        const results = searchFuzzy("octo", index, docMap, 1);
        expect(results.length).toBe(1);
        expect(results[0].docId).toBe(0);
        expect(results[0].filePath).toBe("notes/doc0.md");
    });
});