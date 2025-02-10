import { pipeline, env } from '@xenova/transformers';
import { IEmbedder, EmbedderConfig } from './types';
import { EmbeddingCache } from './cache';

export interface MPNetConfig extends EmbedderConfig {
    maxTokens: number;
    batchSize: number;
    modelName: string;
}

export class MPNetEmbedder implements IEmbedder {
    private pipe: any;
    private config: MPNetConfig;
    private cache?: EmbeddingCache;

    constructor(config: MPNetConfig) {
        env.allowLocalModels = true;
        this.config = {
            ...config,
        };

        this.pipe = undefined;

        // Initialize cache if enabled
        if (this.config.cache?.enabled) {
            // No cache initialization in the original code
        }
    }

    async generateEmbeddings(texts: string | string[]): Promise<number[][]> {
        if (!this.pipe) {
            this.pipe = await pipeline('feature-extraction', this.config.modelName);
        }

        if (typeof texts === 'string') {
            texts = [texts];
        }

        const output = await this.pipe(texts, {
            pooling_mode: 'mean',
            normalize: true
        });

        return texts.map((_, index) => Array.from(output.tolist()[index]));
    }

    getEmbeddingDimension(): number {
        return 768; // MPNet embedding dimension is 768
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
}
