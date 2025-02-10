import { IEmbedder } from '../embedder/types';

/**
 * Vector embedding search functionality
 */
export class EmbeddingSearch {
    private embeddings: Map<string, number[]>;
    private embedder?: IEmbedder;
    
    constructor(embedder?: IEmbedder) {
        this.embeddings = new Map();
        this.embedder = embedder;
    }

    /**
     * Add or update embedding for a node
     */
    addEmbedding(nodeId: string, embedding: number[]): void {
        this.embeddings.set(nodeId, embedding);
    }

    /**
     * Generate embedding for text
     */
    async generateEmbedding(text: string): Promise<number[]> {
        if (!this.embedder) {
            throw new Error('Embedder is not initialized');
        }
        const embeddings = await this.embedder.generateEmbeddings(text);
        return embeddings[0];
    }

    /**
     * Search for similar nodes using embedding
     */
    async search(query: string, limit: number = 10): Promise<string[]> {
        const embedding = await this.generateEmbedding(query);
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
