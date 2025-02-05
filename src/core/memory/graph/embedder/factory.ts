import { IEmbedder, EmbedderConfig, EmbedderProvider } from './types';
import { BGEEmbedder, BGEConfig } from './bge';

// Default configurations for each provider
const DEFAULT_CONFIGS: Record<EmbedderProvider, Partial<EmbedderConfig>> = {
    [EmbedderProvider.BGE]: {
        modelName: 'Xenova/all-MiniLM-L6-v2',
        maxTokens: 8192,
        batchSize: 32,
        cache: {
            enabled: true,
            maxSize: 10000,
            ttl: 24 * 60 * 60 * 1000 // 24 hours
        }
    },
    [EmbedderProvider.OpenAI]: {
        modelName: 'text-embedding-3-small',
        maxTokens: 8191,
        batchSize: 100,
        cache: {
            enabled: true,
            maxSize: 10000,
            ttl: 24 * 60 * 60 * 1000
        }
    },
    [EmbedderProvider.VoyageAI]: {
        modelName: 'voyage-3',
        maxTokens: 8192,
        batchSize: 100,
        cache: {
            enabled: true,
            maxSize: 10000,
            ttl: 24 * 60 * 60 * 1000
        }
    }
};

/**
 * Factory for creating embedding providers
 */
export class EmbedderFactory {
    /**
     * Create an embedder instance with the specified provider and configuration
     */
    static create(
        provider: EmbedderProvider = EmbedderProvider.BGE,
        config: Partial<EmbedderConfig> = {}
    ): IEmbedder {
        // Merge with default config for the provider
        const defaultConfig = DEFAULT_CONFIGS[provider];
        const mergedConfig = {
            ...defaultConfig,
            ...config,
            provider // Ensure provider is set
        };

        switch (provider) {
            case EmbedderProvider.BGE:
                return new BGEEmbedder(mergedConfig as BGEConfig);
            
            case EmbedderProvider.OpenAI:
                if (!mergedConfig.apiKey) {
                    throw new Error('OpenAI embedder requires an API key');
                }
                // TODO: Implement OpenAI embedder
                throw new Error('OpenAI embedder not yet implemented');
            
            case EmbedderProvider.VoyageAI:
                if (!mergedConfig.apiKey) {
                    throw new Error('VoyageAI embedder requires an API key');
                }
                // TODO: Implement VoyageAI embedder
                throw new Error('VoyageAI embedder not yet implemented');
            
            default:
                throw new Error(`Unsupported embedder provider: ${provider}`);
        }
    }

    /**
     * Get the default configuration for a provider
     */
    static getDefaultConfig(provider: EmbedderProvider): Partial<EmbedderConfig> {
        return DEFAULT_CONFIGS[provider];
    }
}

export { EmbedderProvider };
