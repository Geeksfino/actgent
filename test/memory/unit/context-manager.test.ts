import { describe, test, expect, beforeEach } from 'bun:test';
import { MemoryContextManager } from '../../../src/core/memory/MemoryContextManager';
import { MockMemoryStorage, MockMemoryIndex } from '../utils/test-helpers';
import { createContextualMemory } from '../utils/test-data';
import { MemoryType, MemoryFilter } from '../../../src/core/memory/types';

describe('MemoryContextManager', () => {
    let contextManager: MemoryContextManager;
    let storage: MockMemoryStorage;
    let index: MockMemoryIndex;

    beforeEach(() => {
        storage = new MockMemoryStorage();
        index = new MockMemoryIndex();
        contextManager = new MemoryContextManager(storage, index);
    });

    test('should manage explicit context', async () => {
        contextManager.setContext('key1', 'value1');
        contextManager.setContext('key2', 'value2');

        const context = await contextManager.getAllContext();
        expect(context.get('key1')).toBe('value1');
        expect(context.get('key2')).toBe('value2');
    });

    test('should clear context properly', async () => {
        contextManager.setContext('key1', 'value1');
        contextManager.setContext('key2', 'value2');

        contextManager.clearContext();

        const context = await contextManager.getAllContext();
        expect(context.size).toBe(0);
    });

    test('should load context based on filter', async () => {
        const memory = createContextualMemory(
            { operationType: 'test' },
            'operationType'
        );

        await storage.store(memory);

        await contextManager.loadContext({
            types: [MemoryType.CONTEXTUAL],
            metadataFilters: [new Map([['type', MemoryType.CONTEXTUAL]])]
        });

        const context = await contextManager.getAllContext();
        expect(context.get('operationType')).toBe('test');
    });

    test('should handle memory-derived context', async () => {
        // Store a memory with context
        const memory1 = createContextualMemory(
            { operationType: 'test' },
            'operationType'
        );
        await storage.store(memory1);

        // Store another memory with different context
        const memory2 = createContextualMemory(
            { operationStatus: 'running' },
            'operationStatus'
        );
        await storage.store(memory2);

        // Load context
        await contextManager.loadContext({
            types: [MemoryType.CONTEXTUAL],
            metadataFilters: [new Map<string, any>([['type', MemoryType.CONTEXTUAL]])]
        });

        // Verify context includes both memory-derived contexts
        const context = await contextManager.getContext('operationType');
        expect(context).toBe('test');
        const status = await contextManager.getContext('operationStatus');
        expect(status).toBe('running');
    });

    test('should store context as episodic memory', async () => {
        // Set some context
        await contextManager.setContext('key1', 'value1');
        await contextManager.setContext('key2', 'value2');

        // Store as episodic memory
        await contextManager.storeContextAsEpisodicMemory(
            new Map<string, any>([['contextType', 'test']])
        );

        // Retrieve the stored context memory
        const filter: MemoryFilter = {
            types: [MemoryType.CONTEXTUAL],
            metadataFilters: [new Map<string, any>([['contextType', 'test']])]
        };

        const memories = await storage.retrieveByFilter(filter);
        expect(memories.length).toBe(1);
        expect(memories[0].content).toEqual({
            key1: 'value1',
            key2: 'value2'
        });
    });

    test('should maintain context history', async () => {
        // Set initial context
        await contextManager.setContext('key1', 'value1');
        await contextManager.storeContextAsEpisodicMemory(new Map<string, any>([
            ['contextType', 'test'],
            ['version', 1]
        ]));

        // Update context
        await contextManager.setContext('key1', 'value2');
        await contextManager.storeContextAsEpisodicMemory(new Map<string, any>([
            ['contextType', 'test'],
            ['version', 2]
        ]));

        // Get context history
        const history = await contextManager.getContextHistory();
        expect(history.length).toBe(2);
        expect(history[0].content.key1).toBe('value1');
        expect(history[1].content.key1).toBe('value2');
    });

    test('should handle context updates', async () => {
        // Set initial context
        contextManager.setContext('key1', 'value1');

        // Update context
        contextManager.setContext('key1', 'value2');

        // Verify only the latest value is present
        const context = await contextManager.getAllContext();
        expect(context.get('key1')).toBe('value2');
        expect(context.size).toBe(1);
    });
});
