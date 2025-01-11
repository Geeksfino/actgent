import { expect, test, describe, beforeEach } from 'bun:test';
import { MemoryContextManager } from '../../../src/core/memory/SessionMemoryContextManager';
import { MockMemoryStorage, MockMemoryIndex } from '../utils/test-helpers';

describe('MemoryContextManager', () => {
    let contextManager: MemoryContextManager;
    let storage: MockMemoryStorage;
    let index: MockMemoryIndex;

    beforeEach(() => {
        storage = new MockMemoryStorage();
        index = new MockMemoryIndex();
        contextManager = new MemoryContextManager(storage, index);
    });

    test('should set and get context values', async () => {
        const key = 'testKey';
        const value = 'testValue';

        await contextManager.setContext(key, value);
        const retrievedValue = await contextManager.getContext(key);

        expect(retrievedValue).toBe(value);
    });

    test('should update existing context values', async () => {
        const key = 'testKey';
        const initialValue = 'initialValue';
        const updatedValue = 'updatedValue';

        await contextManager.setContext(key, initialValue);
        await contextManager.setContext(key, updatedValue);

        const retrievedValue = await contextManager.getContext(key);
        expect(retrievedValue).toBe(updatedValue);
    });

    test('should handle multiple context values', async () => {
        const contexts = new Map([
            ['key1', 'value1'],
            ['key2', 'value2'],
            ['key3', 'value3']
        ]);

        // Set multiple context values
        for (const [key, value] of contexts) {
            await contextManager.setContext(key, value);
        }

        // Verify each value
        for (const [key, value] of contexts) {
            const retrievedValue = await contextManager.getContext(key);
            expect(retrievedValue).toBe(value);
        }
    });

    test('should handle context expiration', async () => {
        const key = 'expiringKey';
        const value = 'expiringValue';

        await contextManager.setContext(key, value);
        
        // Value should exist immediately
        let retrievedValue = await contextManager.getContext(key);
        expect(retrievedValue).toBe(value);

        // Wait for expiration
        await new Promise(resolve => setTimeout(resolve, 150));

        // Value should be gone
        retrievedValue = await contextManager.getContext(key);
        expect(retrievedValue).toBeUndefined();
    });

    test('should clear context values', async () => {
        const key = 'testKey';
        const value = 'testValue';

        await contextManager.setContext(key, value);
        await contextManager.clearContext();

        const retrievedValue = await contextManager.getContext(key);
        expect(retrievedValue).toBeUndefined();
    });

    test('should clear all context values', async () => {
        const contexts = new Map([
            ['key1', 'value1'],
            ['key2', 'value2']
        ]);

        // Set values
        for (const [key, value] of contexts) {
            await contextManager.setContext(key, value);
        }

        // Clear all
        await contextManager.clearContext();

        // Verify all are cleared
        for (const [key] of contexts) {
            const retrievedValue = await contextManager.getContext(key);
            expect(retrievedValue).toBeUndefined();
        }
    });
});
