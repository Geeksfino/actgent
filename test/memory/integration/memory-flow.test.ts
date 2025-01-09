import { expect, test, describe, beforeEach } from 'bun:test';
import { AgentMemorySystem } from '../../../src/core/memory/AgentMemorySystem';
import { MockMemoryStorage, MockMemoryIndex } from '../utils/test-helpers';
import { MemoryType } from '../../../src/core/memory/types';

describe('Memory Flow Integration', () => {
    let memorySystem: AgentMemorySystem;
    let storage: MockMemoryStorage;
    let index: MockMemoryIndex;

    beforeEach(() => {
        storage = new MockMemoryStorage();
        index = new MockMemoryIndex();
        memorySystem = new AgentMemorySystem(storage, index);
    });

    test('should flow from working to episodic memory', async () => {
        // Store in working memory
        const content = 'Test memory content';
        const metadata = new Map([['importance', 'high']]);
        
        await memorySystem.storeWorkingMemory(content, metadata);

        // Verify it's in working memory
        const workingFilter = {
            types: [MemoryType.WORKING],
            metadataFilters: [new Map([['importance', 'high']])]
        };
        let workingMemories = await memorySystem.retrieveWorkingMemories(workingFilter);
        expect(workingMemories.length).toBe(1);
        expect(workingMemories[0].content).toBe(content);

        // Consolidate to episodic memory
        await memorySystem.consolidateWorkingMemory();

        // Verify it's moved to episodic memory
        const episodicFilter = {
            types: [MemoryType.EPISODIC],
            metadataFilters: [new Map([['importance', 'high']])]
        };
        const episodicMemories = await memorySystem.retrieveEpisodicMemories(episodicFilter);
        expect(episodicMemories.length).toBe(1);
        expect(episodicMemories[0].content).toBe(content);

        // Verify it's no longer in working memory
        workingMemories = await memorySystem.retrieveWorkingMemories(workingFilter);
        expect(workingMemories.length).toBe(0);
    });

    test('should handle multiple memory operations', async () => {
        const memories = [
            { content: 'Memory 1', metadata: new Map([['tag', 'test1']]) },
            { content: 'Memory 2', metadata: new Map([['tag', 'test2']]) },
            { content: 'Memory 3', metadata: new Map([['tag', 'test3']]) }
        ];

        // Store all memories
        for (const memory of memories) {
            await memorySystem.storeWorkingMemory(memory.content, memory.metadata);
        }

        // Verify all are stored
        const filter = { types: [MemoryType.WORKING] };
        const storedMemories = await memorySystem.retrieveWorkingMemories(filter);
        expect(storedMemories.length).toBe(memories.length);

        // Consolidate all memories
        await memorySystem.consolidateWorkingMemory();

        // Verify all moved to episodic memory
        const episodicFilter = { types: [MemoryType.EPISODIC] };
        const episodicMemories = await memorySystem.retrieveEpisodicMemories(episodicFilter);
        expect(episodicMemories.length).toBe(memories.length);

        // Verify working memory is empty
        const emptyWorking = await memorySystem.retrieveWorkingMemories(filter);
        expect(emptyWorking.length).toBe(0);
    });

    test('should maintain memory metadata through flow', async () => {
        const content = 'Test memory';
        const metadata = new Map<string, string>([
            ['importance', 'high'],
            ['category', 'test'],
            ['timestamp', new Date().toISOString()]
        ]);

        // Store in working memory
        await memorySystem.storeWorkingMemory(content, metadata);

        // Consolidate to episodic memory
        await memorySystem.consolidateWorkingMemory();

        // Retrieve from episodic memory and verify metadata
        const filter = {
            types: [MemoryType.EPISODIC],
            metadataFilters: [new Map([['category', 'test']])]
        };
        const memories = await memorySystem.retrieveEpisodicMemories(filter);
        
        expect(memories.length).toBe(1);
        expect(memories[0].content).toBe(content);
        expect(memories[0].metadata.get('importance')).toBe('high');
        expect(memories[0].metadata.get('category')).toBe('test');
        expect(memories[0].metadata.has('timestamp')).toBe(true);
    });
});
