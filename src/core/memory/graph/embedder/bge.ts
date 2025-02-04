import { pipeline, env } from '@xenova/transformers';
import { IEmbedder, EmbedderConfig } from './types';

/**
 * Configuration for BGE embedder
 */
export interface BGEConfig extends EmbedderConfig {
    modelName: 'BAAI/bge-m3' | 'BAAI/bge-m3-lite';
    quantized?: boolean;  // Use quantized model for smaller memory footprint
    cacheDir?: string;    // Custom cache directory for model files
}

interface PipelineOptions {
    quantized?: boolean;
    revision?: string;
    pooling?: 'mean' | 'cls';
    normalize?: boolean;
}

interface TransformerOutput {
    data: Float32Array;
}

type FeatureExtractionPipeline = {
    (text: string, options?: PipelineOptions): Promise<TransformerOutput>;
};

/**
 * BGE-M3 embedding provider using transformers.js
 */
export class BGEEmbedder implements IEmbedder {
    private model: FeatureExtractionPipeline | null = null;
    private readonly embeddingDim: number;
    
    constructor(private config: BGEConfig) {
        // Set embedding dimension based on model
        this.embeddingDim = config.modelName === 'BAAI/bge-m3' ? 1024 : 512;
        
        // Set custom cache directory if provided
        if (config.cacheDir) {
            env.cacheDir = config.cacheDir;
        }
    }
    
    private async ensureModel(): Promise<FeatureExtractionPipeline> {
        if (!this.model) {
            console.log(`Loading BGE model: ${this.config.modelName}${this.config.quantized ? ' (quantized)' : ''}`);
            console.log('First time usage will download the model files (~1GB for full model, ~500MB for lite)');
            
            try {
                const model = await pipeline('feature-extraction', this.config.modelName, {
                    quantized: this.config.quantized,
                    revision: this.config.quantized ? 'quantized' : 'main',
                    progress_callback: (progress: { status: string; file: string; progress: number }) => {
                        if (progress.status === 'downloading') {
                            console.log(`Downloading ${progress.file}: ${Math.round(progress.progress * 100)}%`);
                        } else if (progress.status === 'loading') {
                            console.log(`Loading ${progress.file} into memory...`);
                        }
                    }
                });
                
                // Wrap the model to ensure consistent typing
                this.model = async (text: string, options?: PipelineOptions) => {
                    const result = await model(text, options);
                    return result as TransformerOutput;
                };
                
                console.log('BGE model loaded successfully');
            } catch (error) {
                console.error('Failed to load BGE model:', error);
                throw new Error(`Failed to load BGE model: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        return this.model;
    }
    
    async generateEmbeddings(texts: string | string[]): Promise<number[][]> {
        const model = await this.ensureModel();
        const inputTexts = Array.isArray(texts) ? texts : [texts];
        
        // Process in batches to avoid memory issues
        const embeddings: number[][] = [];
        for (let i = 0; i < inputTexts.length; i += this.config.batchSize) {
            const batch = inputTexts.slice(i, i + this.config.batchSize);
            const batchResults = await Promise.all(
                batch.map(text => model(text, { 
                    pooling: 'mean', 
                    normalize: true 
                }))
            );
            embeddings.push(...batchResults.map(result => Array.from(result.data)));
        }
        
        return embeddings;
    }
    
    getEmbeddingDimension(): number {
        return this.embeddingDim;
    }
    
    getMaxTokens(): number {
        return this.config.maxTokens;
    }
    
    /**
     * Clear any cached data
     */
    public async clear(): Promise<void> {
        this.model = null;
    }
}
