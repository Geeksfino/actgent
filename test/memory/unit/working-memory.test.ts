import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { WorkingMemory } from '../../../src/core/memory/WorkingMemory';
import { MockMemoryStorage, MockMemoryIndex } from '../utils/test-helpers';
import { createWorkingMemory } from '../utils/test-data';
import { MemoryType, MemoryFilter } from '../../../src/core/memory/types';
import { debugLog } from '../utils/test-utils';

describe('WorkingMemory', () => {
    let workingMemory: WorkingMemory;
    let storage: MockMemoryStorage;
    let index: MockMemoryIndex;
    let originalDateNow: () => number;
    const mockNow = new Date('2025-01-08T13:34:17+08:00').getTime();

    beforeEach(() => {
        storage = new MockMemoryStorage();
        index = new MockMemoryIndex();
        workingMemory = new WorkingMemory(storage, index);
        originalDateNow = Date.now;
        Date.now = () => mockNow;
    });

    afterEach(() => {
        Date.now = originalDateNow;
    });

    test('should store and retrieve working memories', async () => {
        const content = { text: 'working memory' };
        const metadata = new Map<string, any>([
            ['type', MemoryType.WORKING],
            ['expiresAt', mockNow + 10000] // Not expired yet
        ]);
        
        debugLog('Before store - metadata:', Object.fromEntries(metadata.entries()));
        await workingMemory.store(content, metadata);
        
        // Check what's in storage directly
        const allMemories = await storage.retrieveByFilter({});
        debugLog('After store - all memories:', allMemories.map(m => ({
            id: m.id,
            content: m.content,
            metadata: Object.fromEntries(m.metadata.entries()),
            timestamp: m.timestamp
        })));
        
        const filter: MemoryFilter = {
            types: [MemoryType.WORKING]
        };
        debugLog('Filter:', filter);

        const memories = await workingMemory.retrieve(filter);
        debugLog('Retrieved memories:', memories.map(m => ({
            id: m.id,
            content: m.content,
            metadata: Object.fromEntries(m.metadata.entries()),
            timestamp: m.timestamp
        })));
        
        expect(memories.length).toBe(1);
        expect(memories[0].content).toEqual(content);
    });

    test('should handle immediate expiration by removing memory', async () => {
        const memory = createWorkingMemory(
            { text: 'test memory' },
            Date.now() - 1000 // Already expired
        );

        await workingMemory.store(memory.content, memory.metadata);

        const workingMemories = await storage.retrieveByFilter({
            types: [MemoryType.WORKING]
        });
        expect(workingMemories.length).toBe(0);

        const episodicMemories = await storage.retrieveByFilter({
            types: [MemoryType.EPISODIC]
        });
        expect(episodicMemories.length).toBe(0);
    });

    test('should handle expiration after delay', async () => {
        const memory = createWorkingMemory(
            { text: 'test memory' },
            Date.now() + 100 // Will expire in 100ms
        );

        await workingMemory.store(memory.content, memory.metadata);
        await new Promise(resolve => setTimeout(resolve, 150)); // Wait for expiration

        const memories = await storage.retrieveByFilter({
            types: [MemoryType.WORKING]
        });
        expect(memories.length).toBe(0);
    });

    test('should cleanup expired memories', async () => {
        const memory1 = createWorkingMemory(
            { text: 'memory 1' },
            Date.now() - 1000 // Already expired
        );

        const memory2 = createWorkingMemory(
            { text: 'memory 2' },
            Date.now() + 1000 // Not expired
        );

        await workingMemory.store(memory1.content, memory1.metadata);
        await workingMemory.store(memory2.content, memory2.metadata);

        const memories = await storage.retrieveByFilter({
            types: [MemoryType.WORKING]
        });

        expect(memories.length).toBe(1);
        expect(memories[0].content.text).toBe('memory 2');
    });

    test('should handle immediate expiration', async () => {
        const content = { text: 'test memory' };
        const metadata = new Map<string, any>([
            ['type', MemoryType.WORKING],
            ['expiresAt', mockNow - 2000] // Already expired
        ]);

        await workingMemory.store(content, metadata);

        // Verify it's not stored at all
        const workingMemories = await storage.retrieveByFilter({
            types: [MemoryType.WORKING]
        });
        expect(workingMemories.length).toBe(0);

        const episodicMemories = await storage.retrieveByFilter({
            types: [MemoryType.EPISODIC]
        });
        expect(episodicMemories.length).toBe(0);
    });

    test('should handle batch transition to episodic memory', async () => {
        // Store multiple memories with same context
        const context = 'test-context';
        const memories = [
            createWorkingMemory({ text: 'memory 1' }, mockNow + 10000),
            createWorkingMemory({ text: 'memory 2' }, mockNow + 10000)
        ];

        for (const mem of memories) {
            await workingMemory.store(mem.content, new Map<string, any>([
                ['type', MemoryType.WORKING],
                ['context', context],
                ['expiresAt', mockNow + 10000]
            ]));
        }

        // Consolidate to episodic
        await workingMemory.consolidateToEpisodic();

        // Verify working memories are gone
        const workingMemories = await storage.retrieveByFilter({
            types: [MemoryType.WORKING]
        });
        expect(workingMemories.length).toBe(0);

        // Verify episodic consolidation
        const episodicMemories = await storage.retrieveByFilter({
            types: [MemoryType.EPISODIC]
        });
        expect(episodicMemories.length).toBe(1);  // Consolidated into one
        expect(episodicMemories[0].metadata.get('transitionType')).toBe('batch');
        expect(episodicMemories[0].metadata.get('context')).toBe(context);
        expect(episodicMemories[0].content.memories.length).toBe(2);
    });

    test('should handle capacity-based transitions', async () => {
        // Fill working memory to capacity
        const memories = Array.from({ length: 101 }, (_, i) => ({ 
            text: `memory ${i}`,
            relevance: i / 100  // Higher index = more relevant
        }));

        for (const mem of memories) {
            await workingMemory.store(mem, new Map<string, any>([
                ['type', MemoryType.WORKING],
                ['relevance', mem.relevance],
                ['expiresAt', mockNow + 10000]
            ]));
        }

        // Verify least relevant memories were moved to episodic
        const workingMemories = await storage.retrieveByFilter({
            types: [MemoryType.WORKING]
        });
        expect(workingMemories.length).toBeLessThanOrEqual(100);

        const episodicMemories = await storage.retrieveByFilter({
            types: [MemoryType.EPISODIC]
        });
        expect(episodicMemories.length).toBeGreaterThan(0);
        episodicMemories.forEach(mem => {
            expect(mem.metadata.get('transitionType')).toBe('immediate');
        });
    });

    test('should handle memory updates', async () => {
        const initialContent = { text: 'initial content' };
        const initialMetadata = new Map<string, any>([
            ['type', MemoryType.WORKING],
            ['expiresAt', mockNow + 10000] // Not expired yet
        ]);

        await workingMemory.store(initialContent, initialMetadata);

        // Update memory with new content
        const updatedContent = { text: 'updated content' };
        const memories = await workingMemory.retrieve({ types: [MemoryType.WORKING] });
        expect(memories.length).toBe(1);

        const memory = memories[0];
        memory.content = updatedContent;
        await workingMemory.updateMemory(memory);

        // Verify update
        const updatedMemories = await workingMemory.retrieve({ types: [MemoryType.WORKING] });
        expect(updatedMemories.length).toBe(1);
        expect(updatedMemories[0].content).toEqual(updatedContent);
    });

    test('should handle batch operations', async () => {
        const memories = [
            createWorkingMemory({ text: 'memory 1' }, mockNow + 10000),
            createWorkingMemory({ text: 'memory 2' }, mockNow + 10000)
        ];

        // Store multiple memories
        await Promise.all(memories.map(memory => workingMemory.store(memory.content, memory.metadata)));

        // Retrieve all memories
        const retrievedMemories = await workingMemory.retrieve({ types: [MemoryType.WORKING] });
        expect(retrievedMemories.length).toBe(2);
        expect(retrievedMemories.map(m => m.content.text).sort()).toEqual(['memory 1', 'memory 2'].sort());
    });
});
