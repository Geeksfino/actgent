import { describe, it, expect } from 'vitest';
import { DEFAULT_RERANKER_CONFIG, DEFAULT_SEARCH_CONFIG } from '../defaults';
import type { RerankerConfig, VectorSearchConfig, TextSearchConfig, HybridSearchConfig, LLMSearchConfig } from '../types';

describe('Graph Configuration', () => {
    describe('Default Reranker Config', () => {
        it('should have all required base fields', () => {
            expect(DEFAULT_RERANKER_CONFIG.enabled).toBeDefined();
            expect(DEFAULT_RERANKER_CONFIG.maxResults).toBeDefined();
        });

        it('should have valid MMR configuration', () => {
            const { mmr } = DEFAULT_RERANKER_CONFIG;
            expect(mmr).toBeDefined();
            expect(mmr?.lambda).toBeGreaterThan(0);
            expect(mmr?.lambda).toBeLessThan(1);
            expect(['cosine', 'euclidean']).toContain(mmr?.diversityMetric);
        });

        it('should have valid RRF configuration', () => {
            const { rrf } = DEFAULT_RERANKER_CONFIG;
            expect(rrf).toBeDefined();
            expect(rrf?.k).toBeGreaterThan(0);
            expect(typeof rrf?.useRankFusion).toBe('boolean');
        });

        it('should have valid weight configuration', () => {
            const { weights } = DEFAULT_RERANKER_CONFIG;
            expect(weights).toBeDefined();
            
            // All weights should be between 0 and 1
            Object.values(weights || {}).forEach(weight => {
                expect(weight).toBeGreaterThanOrEqual(0);
                expect(weight).toBeLessThanOrEqual(1);
            });
        });
    });

    describe('Config Type Safety', () => {
        it('should allow partial configuration', () => {
            const partialConfig: Partial<RerankerConfig> = {
                enabled: true,
                mmr: {
                    lambda: 0.5
                }
            };

            const fullConfig: RerankerConfig = {
                ...DEFAULT_RERANKER_CONFIG,
                ...partialConfig
            };

            expect(fullConfig.enabled).toBe(true);
            expect(fullConfig.mmr?.lambda).toBe(0.5);
            // Should preserve other defaults
            expect(fullConfig.maxResults).toBe(DEFAULT_RERANKER_CONFIG.maxResults);
        });
    });
});

describe('Search Configuration', () => {
    describe('Default Search Config', () => {
        it('should have all required base fields', () => {
            expect(DEFAULT_SEARCH_CONFIG.enabled).toBeDefined();
            expect(DEFAULT_SEARCH_CONFIG.maxResults).toBeDefined();
        });

        it('should have valid vector search configuration', () => {
            expect(DEFAULT_SEARCH_CONFIG.vector).toBeDefined();
            expect(DEFAULT_SEARCH_CONFIG.vector?.model).toBe('all-MiniLM-L6-v2');
            expect(DEFAULT_SEARCH_CONFIG.vector?.metric).toBe('cosine');
            expect(DEFAULT_SEARCH_CONFIG.vector?.normalize).toBe(true);
        });

        it('should have valid text search configuration', () => {
            expect(DEFAULT_SEARCH_CONFIG.text).toBeDefined();
            expect(DEFAULT_SEARCH_CONFIG.text?.algorithm).toBe('bm25');
            expect(DEFAULT_SEARCH_CONFIG.text?.useStemming).toBe(true);
            expect(DEFAULT_SEARCH_CONFIG.text?.removeStopwords).toBe(true);
        });

        it('should have valid hybrid search configuration', () => {
            expect(DEFAULT_SEARCH_CONFIG.hybrid).toBeDefined();
            expect(DEFAULT_SEARCH_CONFIG.hybrid?.enabled).toBe(true);
            expect(DEFAULT_SEARCH_CONFIG.hybrid?.vectorWeight).toBe(0.7);
            expect(DEFAULT_SEARCH_CONFIG.hybrid?.textWeight).toBe(0.2);
            expect(DEFAULT_SEARCH_CONFIG.hybrid?.graphWeight).toBe(0.1);
        });

        it('should have valid LLM search configuration', () => {
            expect(DEFAULT_SEARCH_CONFIG.llm).toBeDefined();
            expect(DEFAULT_SEARCH_CONFIG.llm?.enabled).toBe(false);
            expect(DEFAULT_SEARCH_CONFIG.llm?.model).toBe('gpt-3.5-turbo');
            expect(DEFAULT_SEARCH_CONFIG.llm?.useQueryExpansion).toBe(false);
        });
    });

    describe('Config Type Safety', () => {
        it('should allow partial vector search configuration', () => {
            const config: VectorSearchConfig = {
                model: 'custom-model',
                metric: 'euclidean'
            };
            expect(config.model).toBe('custom-model');
            expect(config.metric).toBe('euclidean');
        });

        it('should allow partial text search configuration', () => {
            const config: TextSearchConfig = {
                algorithm: 'fuzzy',
                language: 'spanish'
            };
            expect(config.algorithm).toBe('fuzzy');
            expect(config.language).toBe('spanish');
        });

        it('should allow partial hybrid search configuration', () => {
            const config: HybridSearchConfig = {
                enabled: true,
                vectorWeight: 0.8
            };
            expect(config.enabled).toBe(true);
            expect(config.vectorWeight).toBe(0.8);
        });

        it('should allow partial LLM search configuration', () => {
            const config: LLMSearchConfig = {
                enabled: true,
                useQueryExpansion: true
            };
            expect(config.enabled).toBe(true);
            expect(config.useQueryExpansion).toBe(true);
        });
    });
});
