import { describe, test, expect, beforeEach } from 'bun:test';
import { ConversationContextManager } from '../../../src/core/context/ConversationContextManager';
import { WorkingMemory } from '../../../src/core/memory/WorkingMemory';
import { MockMemoryStorage, MockMemoryIndex } from '../../memory/utils/test-helpers';
import { createTestMessage } from '../utils/test-helpers';

describe('ConversationContextManager', () => {
    let storage: MockMemoryStorage;
    let index: MockMemoryIndex;
    let workingMemory: WorkingMemory;
    let contextManager: ConversationContextManager;

    beforeEach(() => {
        storage = new MockMemoryStorage();
        index = new MockMemoryIndex();
        workingMemory = new WorkingMemory(storage, index);
        contextManager = new ConversationContextManager(workingMemory);
    });

    describe('Basic Context Operations', () => {
        test('should set and get context values', () => {
            contextManager.setContext('key1', 'value1');
            contextManager.setContext('key2', 'value2');

            expect(contextManager.getContextValue('key1')).toBe('value1');
            expect(contextManager.getContextValue('key2')).toBe('value2');
        });

        test('should clear context', () => {
            contextManager.setContext('key1', 'value1');
            contextManager.clearContext();

            expect(contextManager.getContextValue('key1')).toBeUndefined();
        });

        test('should handle undefined context keys', () => {
            expect(contextManager.getContextValue('nonexistent')).toBeUndefined();
        });
    });

    describe('Message Handling', () => {
        test('should add messages to history', async () => {
            const message = createTestMessage('test message');
            contextManager.addMessage(message);

            const context = await contextManager.getContext();
            expect(context.get('history')).toContain('test message');
        });

        test('should handle multiple messages', async () => {
            const messages = [
                createTestMessage('message 1'),
                createTestMessage('message 2', 'assistant'),
                createTestMessage('message 3')
            ];

            for (const message of messages) {
                contextManager.addMessage(message);
            }

            const context = await contextManager.getContext();
            const history = context.get('history');
            expect(history).toContain('message 1');
            expect(history).toContain('message 2');
            expect(history).toContain('message 3');
        });
    });

    describe('Context Integration', () => {
        test('should combine explicit context with history', async () => {
            contextManager.setContext('customKey', 'customValue');
            contextManager.addMessage(createTestMessage('test message'));

            const context = await contextManager.getContext();
            expect(context.get('customKey')).toBe('customValue');
            expect(context.get('history')).toContain('test message');
        });

        test('should maintain context after optimization', async () => {
            contextManager.setContext('persistentKey', 'persistentValue');
            contextManager.addMessage(createTestMessage('old message'));
            
            await contextManager.optimize();
            
            const context = await contextManager.getContext();
            expect(context.get('persistentKey')).toBe('persistentValue');
        });
    });

    describe('Error Handling', () => {
        test('should handle invalid messages gracefully', () => {
            const invalidMessage = { ...createTestMessage('test'), content: undefined };
            expect(() => contextManager.addMessage(invalidMessage as any)).not.toThrow();
        });

        test('should handle context operations with invalid values', () => {
            expect(() => contextManager.setContext('key', undefined)).not.toThrow();
            expect(() => contextManager.setContext(undefined as any, 'value')).not.toThrow();
        });
    });
});
