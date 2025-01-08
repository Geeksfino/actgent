import { describe, test, expect, beforeEach } from 'bun:test';
import { LongTermMemory } from '../../../src/core/memory/LongTermMemory';
import { MockMemoryStorage, MockMemoryIndex } from '../utils/test-helpers';
import { createTestMemory } from '../utils/test-data';
import { MemoryType, MemoryFilter } from '../../../src/core/memory/types';

describe('LongTermMemory', () => {
    let longTermMemory: LongTermMemory;
    let storage: MockMemoryStorage;
    let index: MockMemoryIndex;

    beforeEach(() => {
        storage = new MockMemoryStorage();
        index = new MockMemoryIndex();
        longTermMemory = new LongTermMemory(storage, index);
    });

    test('should store and retrieve episodic memories', async () => {
        const content = { text: 'episodic memory' };
        const metadata = new Map<string, MemoryType>([
            ['type', MemoryType.EPISODIC]
        ]);

        await longTermMemory.store(content, metadata);

        const filter: MemoryFilter = {
            types: [MemoryType.EPISODIC],
            metadataFilters: [metadata]
        };

        const memories = await longTermMemory.retrieve(filter);
        expect(memories.length).toBe(1);
        expect(memories[0].content).toEqual(content);
    });

    test('should store and retrieve semantic memories', async () => {
        const content = { concept: 'test concept', relations: new Map() };
        const metadata = new Map<string, MemoryType>([
            ['type', MemoryType.SEMANTIC]
        ]);

        await longTermMemory.store(content, metadata);

        const filter: MemoryFilter = {
            types: [MemoryType.SEMANTIC],
            metadataFilters: [metadata]
        };

        const memories = await longTermMemory.retrieve(filter);
        expect(memories.length).toBe(1);
        expect(memories[0].content).toEqual(content);
    });

    test('should store and retrieve contextual memories', async () => {
        const content = { context: 'test context' };
        const metadata = new Map<string, MemoryType>([
            ['type', MemoryType.CONTEXTUAL]
        ]);

        await longTermMemory.store(content, metadata);

        const filter: MemoryFilter = {
            types: [MemoryType.CONTEXTUAL],
            metadataFilters: [metadata]
        };

        const memories = await longTermMemory.retrieve(filter);
        expect(memories.length).toBe(1);
        expect(memories[0].content).toEqual(content);
    });

    test('should handle memory classification', async () => {
        // Test automatic classification based on content
        const episodicContent = { 
            timeSequence: 1,
            location: 'test location',
            actors: ['test actor'],
            actions: ['test action']
        };
        await longTermMemory.store(episodicContent);

        const semanticContent = {
            concept: 'test concept',
            relations: new Map<string, string[]>()
        };
        await longTermMemory.store(semanticContent);

        const filter: MemoryFilter = {
            types: [MemoryType.EPISODIC, MemoryType.SEMANTIC]
        };

        const memories = await longTermMemory.retrieve(filter);
        expect(memories.length).toBe(2);

        const episodicMemory = memories.find(m => m.metadata.get('type') === MemoryType.EPISODIC);
        const semanticMemory = memories.find(m => m.metadata.get('type') === MemoryType.SEMANTIC);

        expect(episodicMemory).toBeDefined();
        expect(semanticMemory).toBeDefined();
        expect(episodicMemory?.content).toEqual(episodicContent);
        expect(semanticMemory?.content).toEqual(semanticContent);
    });

    test('should handle batch operations', async () => {
        const memories = [
            createTestMemory({
                content: { text: 'memory 1' },
                metadata: new Map([['type', MemoryType.EPISODIC]])
            }),
            createTestMemory({
                content: { text: 'memory 2' },
                metadata: new Map([['type', MemoryType.SEMANTIC]])
            })
        ];

        await Promise.all(memories.map(m => longTermMemory.store(m.content, m.metadata)));

        const filter: MemoryFilter = {
            types: [MemoryType.EPISODIC, MemoryType.SEMANTIC]
        };

        const retrievedMemories = await longTermMemory.retrieve(filter);
        expect(retrievedMemories.length).toBe(2);
        expect(retrievedMemories.map(m => m.content.text)).toEqual(['memory 1', 'memory 2']);
    });
});
