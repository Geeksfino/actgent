import * as path from 'path';
import { pipeline, env } from '@xenova/transformers';
import { IEmbedder, EmbedderConfig, EmbedderProvider, IEmbeddingCache } from './types';
import { EmbeddingCache } from './cache';

/**
 * Configuration for BGE embedder
 */
export interface BGEConfig extends EmbedderConfig {
    modelName: string;  // Allow any model name
    maxTokens: number;
    batchSize: number;
    quantized?: boolean;  // Use quantized model for smaller memory footprint
    cache?: {
        enabled: boolean;
        maxSize: number;
        ttl: number;
    };
}

/**
 * BGE embedder using transformers.js
 */
export class BGEEmbedder implements IEmbedder {
    private pipe: any;
    private readonly embeddingDim: number = 384;  // MiniLM-L6-v2 dimension
    private readonly config: BGEConfig;
    private cache?: IEmbeddingCache;

    constructor(config: BGEConfig = {
        provider: EmbedderProvider.BGE,
        modelName: 'Xenova/all-MiniLM-L6-v2',
        maxTokens: 8192,
        batchSize: 32,
        quantized: false
    }) {
        env.allowLocalModels = true;
        this.config = config;
        
        // Initialize cache if enabled
        if (config.cache?.enabled) {
            this.cache = new EmbeddingCache(
                config.cache.maxSize,
                config.cache.ttl
            );
        }
    }

    private async ensurePipeline(): Promise<any> {
        if (!this.pipe) {
            console.log(`Loading BGE model: ${this.config.modelName}`);
            try {
                this.pipe = await pipeline('feature-extraction', this.config.modelName, {
                    quantized: this.config.quantized
                });
                console.log('BGE model loaded successfully');
            } catch (error) {
                console.error('Error loading BGE model:', error);
                throw error;
            }
        }
        return this.pipe;
    }

    private async embedSingle(text: string): Promise<number[]> {
        // Check cache first
        if (this.cache) {
            const cached = await this.cache.get(text);
            if (cached) {
                return cached;
            }
        }

        const pipe = await this.ensurePipeline();
        const output = await pipe(text, {
            pooling: 'mean',
            normalize: true
        });
        const embedding = Array.from(output.data as Float32Array);

        // Cache the result
        if (this.cache) {
            await this.cache.set(text, embedding);
        }

        return embedding;
    }

    async generateEmbeddings(texts: string | string[]): Promise<number[][]> {
        const textArray = Array.isArray(texts) ? texts : [texts];
        if (textArray.length === 0) return [];

        // Process in batches
        const batchSize = this.config.batchSize || 32;
        const batches = [];
        for (let i = 0; i < textArray.length; i += batchSize) {
            const batch = textArray.slice(i, i + batchSize);
            batches.push(batch);
        }
        
        // Process each batch
        const allEmbeddings: number[][] = [];
        for (const batch of batches) {
            const embeddings = await Promise.all(
                batch.map(text => this.embedSingle(text))
            );
            allEmbeddings.push(...embeddings);
        }
        
        return allEmbeddings;
    }

    getEmbeddingDimension(): number {
        return this.embeddingDim;
    }

    getMaxTokens(): number {
        return this.config.maxTokens;
    }

    async getCacheStats(): Promise<{ size: number; hits: number; misses: number; } | undefined> {
        return this.cache?.stats();
    }

    async clear(): Promise<void> {
        this.pipe = undefined;
        await this.cache?.clear();
    }
}
