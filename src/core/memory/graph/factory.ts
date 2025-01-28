import { GraphConfig } from './types';
import { GraphManager } from './GraphManager';
import { InMemoryGraphStorage } from './data/InMemoryGraphStorage';

/**
 * Create a new GraphManager instance with default or custom configuration
 */
export function createGraph(config: Partial<GraphConfig> = {}): GraphManager {
    // Merge with default configurations
    const fullConfig: GraphConfig = {
        storage: {
            type: 'memory',
            maxCapacity: 10000,
            ...config.storage
        },
        episode: {
            validateTimestamp: true,
            autoSetValidAt: true,
            ...config.episode
        },
        llm: {
            client: config.llm?.client,
            config: config.llm?.config || {
                model: 'gpt-4',
                temperature: 0.0,
                maxTokens: 1000
            }
        }
    };

    // Validate required fields
    if (!fullConfig.llm.client) {
        throw new Error('LLM client is required in GraphConfig');
    }

    return new GraphManager(fullConfig);
}

/**
 * Create a graph manager for testing purposes with mock LLM
 */
export function createTestGraph(config: Partial<GraphConfig> = {}): GraphManager {
    const mockLLMClient = {
        createChatCompletion: async () => ({
            choices: [{
                message: {
                    function_call: {
                        arguments: JSON.stringify({ result: 'mock result' })
                    }
                }
            }]
        })
    };

    return createGraph({
        ...config,
        llm: {
            client: mockLLMClient,
            config: {
                model: 'gpt-4',
                temperature: 0.0,
                maxTokens: 1000
            }
        }
    });
}
