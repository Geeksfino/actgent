import { describe, test, expect, beforeEach } from 'bun:test';
import { WorkingMemory } from '../../../src/core/memory/WorkingMemory';
import { MockMemoryStorage, MockMemoryIndex } from '../utils/test-helpers';
import { createWorkingMemory } from '../utils/test-data';
import { MemoryType, MemoryFilter } from '../../../src/core/memory/types';

describe('WorkingMemory', () => {
    let workingMemory: WorkingMemory;
    let storage: MockMemoryStorage;
    let index: MockMemoryIndex;

    beforeEach(() => {
        storage = new MockMemoryStorage();
        index = new MockMemoryIndex();
        workingMemory = new WorkingMemory(storage, index);
    });

    test('should store and retrieve working memories', async () => {
        const now = new Date('2025-01-07T22:13:44+08:00').getTime();
        const content = { text: 'working memory' };
        const metadata = new Map<string, MemoryType | number>([
            ['type', MemoryType.WORKING],
            ['expiresAt', now + 10000] // Not expired yet
        ]);
        
        await workingMemory.store(content, metadata);
        
        const filter: MemoryFilter = {
            types: [MemoryType.WORKING],
            metadataFilters: [metadata]
        };

        const memories = await workingMemory.retrieve(filter);
        expect(memories.length).toBe(1);
        expect(memories[0].content).toEqual(content);
    });

    test('should cleanup expired memories', async () => {
        const now = new Date('2025-01-07T22:13:44+08:00').getTime();
        const content = { text: 'test memory' };
        const metadata = new Map<string, any>([
            ['type', MemoryType.WORKING],
            ['expiresAt', now - 2000] // Already expired
        ]);

        await workingMemory.store(content, metadata);

        // Verify it's cleaned up
        const filter: MemoryFilter = {
            types: [MemoryType.WORKING],
            metadataFilters: [metadata]
        };

        const memories = await workingMemory.retrieve(filter);
        expect(memories.length).toBe(0);
    });

    test('should handle memory updates', async () => {
        const now = new Date('2025-01-07T22:13:44+08:00').getTime();
        const content = { text: 'initial content' };
        const metadata = new Map<string, any>([
            ['type', MemoryType.WORKING],
            ['expiresAt', now + 10000]
        ]);

        await workingMemory.store(content, metadata);

        // Retrieve the memory
        const filter: MemoryFilter = {
            types: [MemoryType.WORKING],
            metadataFilters: [metadata]
        };

        const memories = await workingMemory.retrieve(filter);
        expect(memories.length).toBe(1);

        // Update the memory
        const updatedMemory = memories[0];
        updatedMemory.content = { text: 'updated content' };
        await workingMemory.update(updatedMemory);

        // Verify the update
        const updatedMemories = await workingMemory.retrieve(filter);
        expect(updatedMemories.length).toBe(1);
        expect(updatedMemories[0].content).toEqual({ text: 'updated content' });
    });

    test('should handle batch operations', async () => {
        const now = new Date('2025-01-07T22:13:44+08:00').getTime();
        const memories = [
            createWorkingMemory({ text: 'memory 1' }, now + 10000),
            createWorkingMemory({ text: 'memory 2' }, now + 10000)
        ];

        await Promise.all(memories.map(m => workingMemory.store(m.content, m.metadata)));

        const filter: MemoryFilter = {
            types: [MemoryType.WORKING]
        };

        const retrievedMemories = await workingMemory.retrieve(filter);
        expect(retrievedMemories.length).toBe(2);
        expect(retrievedMemories.map(m => m.content.text)).toEqual(['memory 1', 'memory 2']);
    });
});
