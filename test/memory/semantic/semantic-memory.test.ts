import { describe, test, expect, beforeEach } from 'bun:test';
import { SemanticMemory } from '../../../src/core/memory/semantic/SemanticMemory';
import { ConceptGraph } from '../../../src/core/memory/semantic/ConceptGraph';
import { IMemoryUnit, MemoryType } from '../../../src/core/memory/types';
import crypto from 'crypto';

describe('SemanticMemory', () => {
    let semanticMemory: SemanticMemory;
    let conceptGraph: ConceptGraph;

    beforeEach(() => {
        conceptGraph = new ConceptGraph();
        semanticMemory = new SemanticMemory(conceptGraph);
    });

    test('should extract concepts from text memory', async () => {
        const memory: IMemoryUnit = {
            id: crypto.randomUUID(),
            content: 'The quick brown fox jumps over the lazy dog',
            metadata: new Map([['type', MemoryType.SEMANTIC]]),
            timestamp: new Date(),
            accessCount: 0,
            lastAccessed: new Date()
        };

        await semanticMemory.store(memory);
        const concepts = await semanticMemory.findConcepts('fox');
        expect(concepts).toHaveLength(1);
        expect(concepts[0].label).toBe('fox');
    });

    test('should extract concepts from structured memory', async () => {
        const memory: IMemoryUnit = {
            id: crypto.randomUUID(),
            content: {
                text: 'The weather is sunny today',
                properties: { temperature: 25 }
            },
            metadata: new Map([['type', MemoryType.SEMANTIC]]),
            timestamp: new Date(),
            accessCount: 0,
            lastAccessed: new Date()
        };

        await semanticMemory.store(memory);
        const concepts = await semanticMemory.findConcepts('weather');
        expect(concepts).toHaveLength(1);
        expect(concepts[0].label).toBe('weather');
    });

    test('should merge similar concepts', async () => {
        const memory1: IMemoryUnit = {
            id: crypto.randomUUID(),
            content: 'The cat is sleeping',
            metadata: new Map([['type', MemoryType.SEMANTIC]]),
            timestamp: new Date(),
            accessCount: 0,
            lastAccessed: new Date()
        };

        const memory2: IMemoryUnit = {
            id: crypto.randomUUID(),
            content: 'The kitten is playing',
            metadata: new Map([['type', MemoryType.SEMANTIC]]),
            timestamp: new Date(),
            accessCount: 0,
            lastAccessed: new Date()
        };

        await semanticMemory.store(memory1);
        await semanticMemory.store(memory2);

        // Find both concepts
        const cats = await semanticMemory.findConcepts('cat');
        const kittens = await semanticMemory.findConcepts('kitten');
        
        // They should be separate initially
        expect(cats).toHaveLength(1);
        expect(kittens).toHaveLength(1);

        // Merge them
        await semanticMemory.mergeConcepts(cats[0].id, kittens[0].id);

        // After merging, searching for either should return the merged concept
        const afterMergeCats = await semanticMemory.findConcepts('cat');
        const afterMergeKittens = await semanticMemory.findConcepts('kitten');
        expect(afterMergeCats[0].id).toBe(afterMergeKittens[0].id);
    });

    test('should establish relations between concepts', async () => {
        const memory: IMemoryUnit = {
            id: crypto.randomUUID(),
            content: 'Dogs and cats are both animals',
            metadata: new Map([['type', MemoryType.SEMANTIC]]),
            timestamp: new Date(),
            accessCount: 0,
            lastAccessed: new Date()
        };

        await semanticMemory.store(memory);

        // Check that concepts were created
        const dogs = await semanticMemory.findConcepts('dog');
        const cats = await semanticMemory.findConcepts('cat');
        const animals = await semanticMemory.findConcepts('animal');

        expect(dogs).toHaveLength(1);
        expect(cats).toHaveLength(1);
        expect(animals).toHaveLength(1);

        // Check relations
        const dogRelations = await semanticMemory.findRelations(dogs[0].id);
        const catRelations = await semanticMemory.findRelations(cats[0].id);

        expect(dogRelations.length).toBeGreaterThan(0);
        expect(catRelations.length).toBeGreaterThan(0);
    });

    test('should retrieve memories by query', async () => {
        const memory: IMemoryUnit = {
            id: crypto.randomUUID(),
            content: 'Elephants are the largest land animals',
            metadata: new Map([['type', MemoryType.SEMANTIC]]),
            timestamp: new Date(),
            accessCount: 0,
            lastAccessed: new Date()
        };

        await semanticMemory.store(memory);
        const retrieved = await semanticMemory.retrieve('elephant');
        expect(retrieved).toHaveLength(1);
        expect(retrieved[0].content.text).toContain('elephant');
    });

    test('should maintain confidence scores', async () => {
        const memory1: IMemoryUnit = {
            id: crypto.randomUUID(),
            content: 'A dolphin is a mammal',
            metadata: new Map([
                ['type', MemoryType.SEMANTIC],
                ['confidence', '0.9']
            ]),
            timestamp: new Date(),
            accessCount: 0,
            lastAccessed: new Date()
        };

        const memory2: IMemoryUnit = {
            id: crypto.randomUUID(),
            content: 'A dolphin is a fish',
            metadata: new Map([
                ['type', MemoryType.SEMANTIC],
                ['confidence', '0.3']
            ]),
            timestamp: new Date(),
            accessCount: 0,
            lastAccessed: new Date()
        };

        await semanticMemory.store(memory1);
        await semanticMemory.store(memory2);

        const dolphins = await semanticMemory.findConcepts('dolphin');
        expect(dolphins).toHaveLength(1);
        expect(dolphins[0].confidence).toBeGreaterThan(0.8); // Should keep the higher confidence
    });
});
