import { expect, test, describe, beforeEach, afterEach } from 'bun:test';
import { SemanticMemory } from '../../../src/core/memory/semantic/SemanticMemory';
import { MockMemoryStorage } from '../mocks/MockMemoryStorage';
import { MockMemoryIndex } from '../mocks/MockMemoryIndex';
import { MockConceptGraph } from '../mocks/MockConceptGraph';
import { MemoryType } from '../../../src/core/memory/types';

describe('SemanticMemory', () => {
    let semanticMemory: SemanticMemory;
    let mockStorage: MockMemoryStorage;
    let mockIndex: MockMemoryIndex;
    let mockGraph: MockConceptGraph;

    beforeEach(() => {
        mockStorage = new MockMemoryStorage();
        mockIndex = new MockMemoryIndex();
        mockGraph = new MockConceptGraph();
        semanticMemory = new SemanticMemory(mockStorage, mockIndex, mockGraph);
    });

    afterEach(async () => {
        await semanticMemory.cleanup();
    });

    test('should add and retrieve concepts', async () => {
        const concept = 'dog';
        const properties = new Map([
            ['type', 'animal'],
            ['size', 'medium']
        ]);

        await semanticMemory.addConcept(concept, properties);
        const concepts = await mockGraph.findConcepts('dog');
        
        expect(concepts.length).toBe(1);
        expect(concepts[0].name).toBe(concept);
        expect(concepts[0].properties).toEqual(properties);
    });

    test('should add and retrieve relations', async () => {
        await semanticMemory.addConcept('dog', new Map([['type', 'animal']]));
        await semanticMemory.addConcept('cat', new Map([['type', 'animal']]));
        await semanticMemory.addRelation('dog', 'cat', 'chases');

        const relations = await mockGraph.findRelations({ type: 'chases' });
        expect(relations.length).toBe(1);
        expect(relations[0].sourceId).toBe('dog');
        expect(relations[0].targetId).toBe('cat');
    });

    test('should get related concepts', async () => {
        await semanticMemory.addConcept('dog', new Map([['type', 'animal']]));
        await semanticMemory.addConcept('bone', new Map([['type', 'object']]));
        await semanticMemory.addRelation('dog', 'bone', 'likes');

        const related = await semanticMemory.getRelated('dog');
        expect(related.length).toBe(1);
        expect(related[0].name).toBe('bone');
    });

    test('should store and retrieve semantic memories', async () => {
        const content = {
            concept: 'dog',
            fact: 'Dogs are loyal animals'
        };
        const metadata = new Map([
            ['confidence', 0.9],
            ['source', 'observation']
        ]);

        const stored = await semanticMemory.store(content, metadata);
        const retrieved = await semanticMemory.retrieve({
            type: MemoryType.SEMANTIC,
            metadata: new Map([['concept', 'dog']])
        });

        expect(retrieved.length).toBe(1);
        expect(retrieved[0].content).toEqual(content);
        expect(retrieved[0].metadata.get('confidence')).toBe(0.9);
    });

    test('should store and retrieve semantic memories', async () => {
        const content = 'Test semantic memory';
        const metadata = new Map([
            ['type', MemoryType.SEMANTIC],
            ['importance', 0.8]
        ]);

        await semanticMemory.store(content, metadata);
        const memories = await semanticMemory.retrieve({ type: MemoryType.SEMANTIC });
        
        expect(memories).toHaveLength(1);
        expect(memories[0].content).toBe(content);
        expect(memories[0].metadata.get('importance')).toBe(0.8);
    });
});
