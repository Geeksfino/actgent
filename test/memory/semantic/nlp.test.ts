import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { NLPService } from '../../../src/core/memory/semantic/nlp/NLPService';
import { WordEmbeddings } from '../../../src/core/memory/semantic/nlp/WordEmbeddings';
import { RelationType } from '../../../src/core/memory/semantic/types';

describe('NLP Services', () => {
    describe('NLPService', () => {
        let nlpService: NLPService;

        beforeEach(() => {
            // Use a mock API key for testing
            nlpService = new NLPService('test-api-key', 'gpt-4');
        });

        test('should extract concepts and relations', async () => {
            const text = 'Cats and dogs are both mammals that make great pets.';
            const result = await nlpService.extractConcepts(text);

            expect(result.concepts.length).toBeGreaterThan(0);
            expect(result.relations.length).toBeGreaterThan(0);

            // Check concept properties
            const concepts = result.concepts;
            expect(concepts.some(c => c.label.toLowerCase().includes('cat'))).toBe(true);
            expect(concepts.some(c => c.label.toLowerCase().includes('dog'))).toBe(true);
            expect(concepts.some(c => c.label.toLowerCase().includes('mammal'))).toBe(true);

            // Check relation properties
            const relations = result.relations;
            expect(relations.some(r => r.type === RelationType.IS_A)).toBe(true);
        });

        test('should calculate similarity between concepts', async () => {
            const similarity = await nlpService.calculateSimilarity('cat', 'kitten');
            expect(similarity).toBeGreaterThan(0.5);
        });

        test('should classify relationships', async () => {
            const result = await nlpService.classifyRelation('cat', 'animal');
            expect(result.type).toBe(RelationType.IS_A);
            expect(result.confidence).toBeGreaterThan(0.5);
        });
    });

    describe('WordEmbeddings', () => {
        let embeddings: WordEmbeddings;

        beforeEach(() => {
            embeddings = new WordEmbeddings(3); // Use small dimension for testing
        });

        test('should add and retrieve embeddings', async () => {
            const vector = [1, 0, 0];
            await embeddings.addEmbedding('test', vector);
            const retrieved = await embeddings.getEmbedding('test');
            expect(retrieved).toEqual(vector);
        });

        test('should calculate cosine similarity', async () => {
            await embeddings.addEmbedding('word1', [1, 0, 0]);
            await embeddings.addEmbedding('word2', [1, 1, 0]);
            const similarity = await embeddings.calculateSimilarity('word1', 'word2');
            expect(similarity).toBeGreaterThan(0);
            expect(similarity).toBeLessThan(1);
        });

        test('should find similar words', async () => {
            await embeddings.addEmbedding('cat', [1, 0, 0]);
            await embeddings.addEmbedding('kitten', [0.9, 0.1, 0]);
            await embeddings.addEmbedding('dog', [0, 1, 0]);

            const similar = await embeddings.findSimilar('cat', 2);
            expect(similar).toHaveLength(2);
            expect(similar[0].word).toBe('kitten'); // Most similar
        });

        test('should handle missing embeddings gracefully', async () => {
            const similarity = await embeddings.calculateSimilarity('unknown1', 'unknown2');
            expect(similarity).toBe(0);
        });

        test('should reject invalid dimension vectors', async () => {
            await expect(async () => {
                await embeddings.addEmbedding('test', [1, 0]); // Wrong dimension
            }).rejects.toThrow('Vector dimension mismatch');
        });
    });
});
