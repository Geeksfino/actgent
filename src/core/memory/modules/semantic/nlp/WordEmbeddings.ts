import { logger } from '../../../../Logger';

/**
 * Simple word embeddings service using cosine similarity
 */
export class WordEmbeddings {
    private embeddings: Map<string, number[]>;
    private dimension: number;

    constructor(dimension: number = 300) {
        this.embeddings = new Map();
        this.dimension = dimension;
    }

    /**
     * Add a word embedding
     */
    async addEmbedding(word: string | null, vector: number[]): Promise<void> {
        if (!word) return;
        
        if (vector.length !== this.dimension) {
            throw new Error(`Vector dimension mismatch. Expected ${this.dimension}, got ${vector.length}`);
        }
        this.embeddings.set(word.toLowerCase(), vector);
    }

    /**
     * Get the embedding for a word
     */
    async getEmbedding(word: string | null): Promise<number[] | null> {
        if (!word) return null;
        return this.embeddings.get(word.toLowerCase()) || null;
    }

    /**
     * Calculate cosine similarity between two words
     */
    async calculateSimilarity(word1: string | null, word2: string | null): Promise<number> {
        if (!word1 || !word2) return 0;
        
        const vec1 = await this.getEmbedding(word1);
        const vec2 = await this.getEmbedding(word2);

        if (!vec1 || !vec2) {
            logger.warn(`No embedding found for ${!vec1 ? word1 : word2}`);
            return 0;
        }

        return this.cosineSimilarity(vec1, vec2);
    }

    /**
     * Find most similar words
     */
    async findSimilar(word: string | null, topK: number = 10): Promise<Array<{ word: string; similarity: number }>> {
        if (!word) return [];
        
        const vec = await this.getEmbedding(word);
        if (!vec) return [];

        const similarities = Array.from(this.embeddings.entries())
            .map(([w, v]) => ({
                word: w,
                similarity: this.cosineSimilarity(vec, v)
            }))
            .filter(item => item.word !== word.toLowerCase())
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, topK);

        return similarities;
    }

    private cosineSimilarity(vec1: number[], vec2: number[]): number {
        const dotProduct = vec1.reduce((sum, val, i) => sum + val * vec2[i], 0);
        const norm1 = Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0));
        const norm2 = Math.sqrt(vec2.reduce((sum, val) => sum + val * val, 0));
        return dotProduct / (norm1 * norm2);
    }

    /**
     * Load pre-trained embeddings from a file
     */
    async loadEmbeddings(embeddings: Record<string, number[]>): Promise<void> {
        for (const [word, vector] of Object.entries(embeddings)) {
            await this.addEmbedding(word, vector);
        }
    }
}
