import { IEmbedder, EmbedderConfig } from './types';
import { EmbeddingCache } from './cache';

export interface JinaConfig extends EmbedderConfig {
    maxTokens: number;
    batchSize: number;
    modelName: string;
}

export class JinaEmbedder implements IEmbedder {
    private config: JinaConfig;
    private model: any; // Assuming the model type is any
    private cache?: EmbeddingCache;

    constructor(config: JinaConfig) {
        this.config = { ...config };
    }

    async generateEmbeddings(texts: string[]): Promise<number[][]> {
        if (!this.model) {
            throw new Error('Jina Embeddings model not loaded. Call loadModel() first.');
        }

        // Generate embeddings for the given texts
        const embeddings = await this.model.encode(texts);

        // Return the embeddings as a 2D array
        return embeddings.tolist();
    }

    getEmbeddingDimension(): number {
        return 768; // Jina embedding dimension is 768
    }

    getMaxTokens(): number {
        return this.config.maxTokens;
    }

    async getCacheStats(): Promise<any> {
        return undefined;
    }

    async clear(): Promise<void> {
        // No cache to clear
    }

    // Assuming loadModel method is implemented elsewhere
    // async loadModel(): Promise<void> {
    //     // Load the Jina embeddings model
    // }
}
