import { expect, test, describe, beforeEach } from 'vitest';
import { 
    EmbedderFactory, 
    EmbedderProvider,
    EmbeddingCache,
    IEmbedder
} from '../../src/core/memory/graph/embedder';

describe('Embedder System', () => {
    describe('EmbeddingCache', () => {
        let cache: EmbeddingCache;

        beforeEach(() => {
            cache = new EmbeddingCache(2, 1000); // Small cache for testing
        });

        test('should cache and retrieve embeddings', async () => {
            const text = 'test text';
            const embedding = [1, 2, 3];
            
            await cache.set(text, embedding);
            const retrieved = await cache.get(text);
            
            expect(retrieved).toEqual(embedding);
            
            const stats = await cache.stats();
            expect(stats.hits).toBe(1);
            expect(stats.misses).toBe(0);
        });

        test('should handle cache misses', async () => {
            const retrieved = await cache.get('nonexistent');
            
            expect(retrieved).toBeUndefined();
            
            const stats = await cache.stats();
            expect(stats.hits).toBe(0);
            expect(stats.misses).toBe(1);
        });

        test('should respect max size', async () => {
            await cache.set('text1', [1]);
            await cache.set('text2', [2]);
            await cache.set('text3', [3]); // Should evict text1
            
            expect(await cache.get('text1')).toBeUndefined();
            expect(await cache.get('text2')).toEqual([2]);
            expect(await cache.get('text3')).toEqual([3]);
        });

        test('should respect TTL', async () => {
            const cache = new EmbeddingCache(10, 100); // 100ms TTL
            await cache.set('text', [1]);
            
            expect(await cache.get('text')).toEqual([1]);
            
            await new Promise(resolve => setTimeout(resolve, 150));
            expect(await cache.get('text')).toBeUndefined();
        });
    });

    describe('BGE Embedder', () => {
        test('should generate embeddings with caching', async () => {
            const embedder = EmbedderFactory.create(EmbedderProvider.BGE, {
                cache: {
                    enabled: true,
                    maxSize: 100,
                    ttl: 1000
                }
            });

            // First call should miss cache
            const text = 'test embedding';
            const embeddings1 = await embedder.generateEmbeddings(text);
            
            expect(embeddings1).toHaveLength(1);
            expect(embeddings1[0]).toHaveLength(384); // BGE dimension
            
            // Second call should hit cache
            const embeddings2 = await embedder.generateEmbeddings(text);
            expect(embeddings2).toEqual(embeddings1);
            
            const stats = await embedder.getCacheStats();
            expect(stats?.hits).toBe(1);
            expect(stats?.misses).toBe(1);
        });

        test('should handle batch processing', async () => {
            const embedder = EmbedderFactory.create(EmbedderProvider.BGE, {
                batchSize: 2
            });

            const texts = ['text1', 'text2', 'text3'];
            const embeddings = await embedder.generateEmbeddings(texts);
            
            expect(embeddings).toHaveLength(3);
            embeddings.forEach((emb: number[]) => {
                expect(emb).toHaveLength(384);
            });
        });
    });

    describe('EmbedderFactory', () => {
        test('should create BGE embedder with default config', () => {
            const embedder = EmbedderFactory.create();
            expect(embedder).toBeDefined();
        });

        test('should throw for unimplemented providers', () => {
            // First test API key error
            expect(() => 
                EmbedderFactory.create(EmbedderProvider.OpenAI)
            ).toThrow('OpenAI embedder requires an API key');

            // Then test implementation error with API key
            expect(() => 
                EmbedderFactory.create(EmbedderProvider.OpenAI, { apiKey: 'test-key' })
            ).toThrow('OpenAI embedder not yet implemented');
            
            expect(() => 
                EmbedderFactory.create(EmbedderProvider.VoyageAI, { apiKey: 'test-key' })
            ).toThrow('VoyageAI embedder not yet implemented');
        });

        test('should require API key for hosted providers', () => {
            expect(() => 
                EmbedderFactory.create(EmbedderProvider.OpenAI, {})
            ).toThrow('OpenAI embedder requires an API key');
        });
    });
});
