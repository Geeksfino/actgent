import { describe, test, expect, beforeEach } from 'bun:test';
import { WorkingMemory } from '../../../src/core/memory/WorkingMemory';
import { LongTermMemory } from '../../../src/core/memory/LongTermMemory';
import { MemoryContextManager } from '../../../src/core/memory/MemoryContextManager';
import { AgentMemorySystem } from '../../../src/core/memory/AgentMemorySystem';
import { MockMemoryStorage, MockMemoryIndex } from '../utils/test-helpers';
import { createWorkingMemory, createContextualMemory } from '../utils/test-data';
import { MemoryType, MemoryFilter } from '../../../src/core/memory/types';

describe('Memory Flow Integration', () => {
    let storage: MockMemoryStorage;
    let index: MockMemoryIndex;
    let workingMemory: WorkingMemory;
    let longTermMemory: LongTermMemory;
    let contextManager: MemoryContextManager;
    let agentMemory: AgentMemorySystem;

    beforeEach(() => {
        storage = new MockMemoryStorage();
        index = new MockMemoryIndex();
        workingMemory = new WorkingMemory(storage, index);
        longTermMemory = new LongTermMemory(storage, index);
        contextManager = new MemoryContextManager(storage, index);
        agentMemory = new AgentMemorySystem(storage, index);
    });

    test('should handle memory lifecycle from working to long-term', async () => {
        const now = new Date('2025-01-07T22:13:44+08:00').getTime();
        const content = { text: 'test memory' };
        const metadata = new Map<string, any>([
            ['type', MemoryType.WORKING],
            ['expiresAt', now - 2000] // Already expired
        ]);

        // Store in working memory
        await workingMemory.store(content, metadata);

        // Consolidate working memory
        await workingMemory.consolidate();

        // Verify it's not in working memory
        const workingMemories = await workingMemory.retrieve({
            types: [MemoryType.WORKING]
        });
        expect(workingMemories.length).toBe(0);

        // Verify it's moved to long-term memory
        const longTermMemories = await longTermMemory.retrieve({
            types: [MemoryType.EPISODIC]
        });
        expect(longTermMemories.length).toBe(1);
        expect(longTermMemories[0].content).toEqual(content);
    });

    test('should propagate context changes across memory systems', async () => {
        // Set initial context
        await contextManager.setContext('operation', 'test');
        
        // Store memory with context
        await agentMemory.store(
            { text: 'memory with context' },
            new Map<string, any>([
                ['type', MemoryType.WORKING],
                ['operation', 'test']
            ])
        );

        // Update context
        await contextManager.setContext('operation', 'updated');
        
        // Store another memory
        await agentMemory.store(
            { text: 'memory with updated context' },
            new Map<string, any>([
                ['type', MemoryType.WORKING],
                ['operation', 'updated']
            ])
        );

        // Verify memories have correct context
        const memories = await agentMemory.retrieve({
            types: [MemoryType.WORKING],
            metadataFilters: [new Map<string, any>([['operation', 'updated']])]
        });

        expect(memories.length).toBe(1);
        expect(memories[0].content.text).toBe('memory with updated context');

        // Verify first memory still has old context
        const oldMemories = await agentMemory.retrieve({
            types: [MemoryType.WORKING],
            metadataFilters: [new Map<string, any>([['operation', 'test']])]
        });

        expect(oldMemories.length).toBe(1);
        expect(oldMemories[0].content.text).toBe('memory with context');
    });

    test('should handle complex memory interactions', async () => {
        const now = new Date('2025-01-07T22:13:44+08:00').getTime();
        
        // 1. Store working memory with context
        await agentMemory.store(
            { text: 'initial memory' },
            new Map<string, any>([
                ['type', MemoryType.WORKING],
                ['context', 'test'],
                ['expiresAt', now - 2000] // Already expired
            ])
        );

        // 2. Set context
        await agentMemory.setContext('operation', 'test');

        // 3. Store another memory
        await agentMemory.store(
            { text: 'contextual memory' },
            new Map<string, any>([
                ['type', MemoryType.CONTEXTUAL],
                ['context', 'test']
            ])
        );

        // 4. Verify memory state
        const workingMemories = await workingMemory.retrieve({
            types: [MemoryType.WORKING]
        });
        expect(workingMemories.length).toBe(0);

        const contextualMemories = await longTermMemory.retrieve({
            types: [MemoryType.CONTEXTUAL]
        });
        expect(contextualMemories.length).toBe(1);

        const context = await agentMemory.getContext('operation');
        expect(context).toBe('test');
    });
});
