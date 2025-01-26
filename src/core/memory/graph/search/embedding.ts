import { IGraphNode } from '../types';

/**
 * Vector embedding search functionality
 */
export class EmbeddingSearch {
    private embeddings: Map<string, number[]>;
    
    constructor() {
        this.embeddings = new Map();
    }

    /**
     * Add or update embedding for a node
     */
    addEmbedding(nodeId: string, embedding: number[]): void {
        this.embeddings.set(nodeId, embedding);
    }

    /**
     * Search for similar nodes using embedding
     */
    search(embedding: number[], limit: number = 10): string[] {
        const results = this.searchWithScores(embedding, limit);
        return results.map(r => r.id);
    }

    /**
     * Search for similar nodes with similarity scores
     */
    searchWithScores(embedding: number[], limit: number = 10): Array<{ id: string; score: number }> {
        const results: Array<{ id: string; score: number }> = [];

        for (const [id, nodeEmbedding] of this.embeddings) {
            const similarity = this.cosineSimilarity(embedding, nodeEmbedding);
            results.push({ id, score: similarity });
        }

        return results
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }

    /**
     * Remove embedding for a node
     */
    removeEmbedding(nodeId: string): void {
        this.embeddings.delete(nodeId);
    }

    /**
     * Calculate cosine similarity between two vectors
     */
    private cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) {
            throw new Error('Vectors must have the same length');
        }

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }

        if (normA === 0 || normB === 0) {
            return 0;
        }

        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }
}
