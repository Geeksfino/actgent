import { IEmbedder, EmbedderConfig } from './types';
import { BGEEmbedder, BGEConfig } from './bge';

export type EmbedderType = 'bge-m3' | 'bge-m3-lite';
export type BGEModelName = 'BAAI/bge-m3' | 'BAAI/bge-m3-lite';

const BGE_MODEL_NAMES: Record<EmbedderType, BGEModelName> = {
    'bge-m3': 'BAAI/bge-m3',
    'bge-m3-lite': 'BAAI/bge-m3-lite'
} as const;

/**
 * Factory for creating embedding providers
 */
export class EmbedderFactory {
    /**
     * Create an embedder instance
     */
    static create(type: EmbedderType, config: Partial<EmbedderConfig> = {}): IEmbedder {
        const modelName = BGE_MODEL_NAMES[type];
        const bgeConfig: BGEConfig = {
            modelName,
            maxTokens: 8192,
            batchSize: 32,
            quantized: true,  // Use quantized by default for better memory usage
        };
        return new BGEEmbedder(bgeConfig);
    }
}
