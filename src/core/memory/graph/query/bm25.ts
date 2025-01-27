import { IGraphNode } from '../data/types';

/**
 * BM25 parameters
 */
interface BM25Params {
    k1: number;  // Term frequency saturation parameter
    b: number;   // Length normalization parameter
}

/**
 * BM25 text search implementation
 */
export class BM25Search {
    private documents: Map<string, string>;
    private invertedIndex: Map<string, Map<string, number>>;
    private documentLengths: Map<string, number>;
    private averageDocLength: number;
    private params: BM25Params;
    private vocabulary: Set<string>;

    constructor(params: BM25Params = { k1: 1.2, b: 0.75 }) {
        this.documents = new Map();
        this.invertedIndex = new Map();
        this.documentLengths = new Map();
        this.averageDocLength = 0;
        this.params = params;
        this.vocabulary = new Set();
    }

    /**
     * Add or update a document in the index
     */
    addDocument(nodeId: string, content: string): void {
        // Remove old document if it exists
        if (this.documents.has(nodeId)) {
            this.removeDocument(nodeId);
        }

        // Add new document
        this.documents.set(nodeId, content);
        const terms = this.tokenize(content);
        this.documentLengths.set(nodeId, terms.length);

        // Update inverted index
        terms.forEach((term, position) => {
            if (!this.invertedIndex.has(term)) {
                this.invertedIndex.set(term, new Map());
            }
            const postings = this.invertedIndex.get(term)!;
            postings.set(nodeId, (postings.get(nodeId) || 0) + 1);
            this.vocabulary.add(term);
        });

        // Update average document length
        this.updateAverageDocLength();
    }

    /**
     * Remove a document from the index
     */
    private removeDocument(nodeId: string): void {
        if (!this.documents.has(nodeId)) return;

        const content = this.documents.get(nodeId)!;
        const terms = this.tokenize(content);

        terms.forEach(term => {
            const postings = this.invertedIndex.get(term);
            if (postings) {
                postings.delete(nodeId);
                if (postings.size === 0) {
                    this.invertedIndex.delete(term);
                    this.vocabulary.delete(term);
                }
            }
        });

        this.documents.delete(nodeId);
        this.documentLengths.delete(nodeId);
        this.updateAverageDocLength();
    }

    /**
     * Search for documents using BM25 scoring
     */
    search(query: string, limit: number = 10): Array<{ id: string; score: number }> {
        const queryTerms = this.tokenize(query);
        const scores = new Map<string, number>();
        const N = this.documents.size;

        queryTerms.forEach(term => {
            const postings = this.invertedIndex.get(term);
            if (!postings) return;

            const df = postings.size;
            const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);

            postings.forEach((tf, docId) => {
                const docLength = this.documentLengths.get(docId)!;
                const score = this.calculateBM25Score(tf, idf, docLength);
                scores.set(docId, (scores.get(docId) || 0) + score);
            });
        });

        return Array.from(scores.entries())
            .map(([id, score]) => ({ id, score }))
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }

    /**
     * Calculate BM25 score for a term in a document
     */
    private calculateBM25Score(tf: number, idf: number, docLength: number): number {
        const { k1, b } = this.params;
        const normalizedLength = docLength / this.averageDocLength;
        return idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * normalizedLength)));
    }

    /**
     * Update average document length
     */
    private updateAverageDocLength(): void {
        const totalLength = Array.from(this.documentLengths.values()).reduce((a, b) => a + b, 0);
        this.averageDocLength = totalLength / Math.max(1, this.documentLengths.size);
    }

    /**
     * Tokenize text into terms
     */
    private tokenize(text: string): string[] {
        return text.toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(term => term.length > 0);
    }
}
