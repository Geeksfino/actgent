import { describe, test, expect, beforeEach } from 'bun:test';
import { SmartHistoryManager } from '../../../src/core/context/SmartHistoryManager';
import { WorkingMemory } from '../../../src/core/memory/WorkingMemory';
import { MockMemoryStorage, MockMemoryIndex } from '../../memory/utils/test-helpers';
import { createTestMessage, MockContextOptimizer, MockRelevanceOptimizer } from '../utils/test-helpers';
import { MemoryType } from '../../../src/core/memory/types';

describe('SmartHistoryManager', () => {
    let storage: MockMemoryStorage;
    let index: MockMemoryIndex;
    let workingMemory: WorkingMemory;
    let historyManager: SmartHistoryManager;

    beforeEach(async () => {
        storage = new MockMemoryStorage();
        index = new MockMemoryIndex();
        workingMemory = new WorkingMemory(storage, index);
        historyManager = new SmartHistoryManager(workingMemory);
        
        // Set up optimizers
        (historyManager as any).optimizers.set('relevance', new MockRelevanceOptimizer());
        (historyManager as any).optimizers.set('context', new MockContextOptimizer(0.5));

        // Clear any existing memories before each test
        const existingMemories = await workingMemory.retrieve({
            types: [MemoryType.WORKING]
        });
        for (const memory of existingMemories) {
            await workingMemory.delete(memory.id);
        }
    });

    describe('Message Management', () => {
        test('should add messages to history', async () => {
            const message = createTestMessage('test message');
            await historyManager.addMessage(message);

            const context = await historyManager.getContext();
            expect(context).toContain('test message');
        });

        test('should maintain message order', async () => {
            const messages = [
                createTestMessage('first message'),
                createTestMessage('second message'),
                createTestMessage('third message')
            ];

            for (const message of messages) {
                await historyManager.addMessage(message);
            }

            const context = await historyManager.getContext();
            const lines = context.split('\n');
            expect(lines[0]).toContain('first message');
            expect(lines[1]).toContain('second message');
            expect(lines[2]).toContain('third message');
        });
    });

    describe('Memory Integration', () => {
        test('should store messages in working memory', async () => {
            const message = createTestMessage('test message');
            await historyManager.addMessage(message);

            const memories = await workingMemory.retrieve({
                types: [MemoryType.WORKING]
            });

            expect(memories.length).toBe(1);
            expect(memories[0].content).toBe(message.content);
            expect(memories[0].metadata.get('role')).toBe(message.role);
        });

        test('should handle message metadata', async () => {
            const message = createTestMessage('test message', 'user', 0.8, 1.0, 20);
            await historyManager.addMessage(message);

            const memories = await workingMemory.retrieve({
                types: [MemoryType.WORKING]
            });

            expect(memories[0].metadata.get('relevanceScore')).toBe(0.8);
            expect(memories[0].metadata.get('importance')).toBe(1.0);
            expect(memories[0].metadata.get('tokens')).toBe(20);
        });
    });

    describe('Optimization', () => {
        test('should optimize history based on metrics', async () => {
            // Add messages with varying relevance
            const messages = [
                createTestMessage('relevant message', 'user', 0.9),
                createTestMessage('less relevant', 'user', 0.3),
                createTestMessage('important message', 'user', 0.8)
            ];

            for (const message of messages) {
                await historyManager.addMessage(message);
            }

            // Register a test optimizer that filters out low relevance messages
            historyManager.registerOptimizer('test', {
                optimize: async (msgs) => msgs.filter(m => (m.metadata?.relevanceScore || 0) >= 0.5),
                getName: () => 'test',
                getMetadata: () => ({})
            });

            await historyManager.optimize();

            const context = await historyManager.getContext();
            expect(context).toContain('relevant message');
            expect(context).toContain('important message');
            expect(context).not.toContain('less relevant');
        });

        test('should maintain critical context after optimization', async () => {
            const criticalMessage = createTestMessage('critical info', 'system', 1.0, 1.0);
            await historyManager.addMessage(criticalMessage);

            // Add some noise
            for (let i = 0; i < 10; i++) {
                await historyManager.addMessage(
                    createTestMessage(`noise ${i}`, 'user', 0.1)
                );
            }

            await historyManager.optimize();

            const context = await historyManager.getContext();
            expect(context).toContain('critical info');
        });
    });

    describe('Error Handling', () => {
        test('should handle empty history gracefully', async () => {
            const context = await historyManager.getContext();
            expect(context).toBe('');
        });

        test('should handle optimization with empty history', async () => {
            await historyManager.optimize();
            const context = await historyManager.getContext();
            expect(context).toBe('');
        });

        test('should handle invalid message properties', async () => {
            const invalidMessage = { ...createTestMessage('test'), relevanceScore: undefined };
            await historyManager.addMessage(invalidMessage as any);
            const context = await historyManager.getContext();
            expect(context).toContain('test');
        });
    });
});
