import { expect, test, describe, beforeEach } from 'bun:test';
import { SmartHistoryManager } from '../../../src/core/context/SmartHistoryManager';
import { WorkingMemory } from '../../../src/core/memory/WorkingMemory';
import { MockMemoryStorage, MockMemoryIndex } from '../../memory/utils/test-helpers';
import { createTestMessage, MockContextOptimizer, MockRelevanceOptimizer } from '../utils/test-helpers';
import { MemoryType } from '../../../src/core/memory/types';

describe('Context Construction', () => {
    let storage: MockMemoryStorage;
    let index: MockMemoryIndex;
    let workingMemory: WorkingMemory;
    let historyManager: SmartHistoryManager;

    beforeEach(() => {
        storage = new MockMemoryStorage();
        index = new MockMemoryIndex();
        workingMemory = new WorkingMemory(storage, index);
        historyManager = new SmartHistoryManager(workingMemory);
        
        // Set up optimizers
        (historyManager as any).optimizers.set('relevance', new MockRelevanceOptimizer());
        (historyManager as any).optimizers.set('context', new MockContextOptimizer(0.5));
    });

    describe('Token Management', () => {
        test('should respect token limits', async () => {
            // Add messages that would exceed token limit
            const longMessage = 'A'.repeat(1000); // Simulate a very long message
            for (let i = 0; i < 5; i++) {
                await historyManager.addMessage(createTestMessage(longMessage));
            }

            // Get context and verify it's within limits
            const context = await historyManager.getContext();
            const tokenCount = context.length / 4; // Rough estimate of tokens
            expect(tokenCount).toBeLessThan(2048); // Assuming 2048 token limit
        });

        test('should prioritize recent messages when trimming', async () => {
            // Add a sequence of messages
            const messages = [
                createTestMessage('First message', 'user', 0.7),
                createTestMessage('Second message', 'user', 0.8),
                createTestMessage('Third message', 'user', 0.9)
            ];

            for (const msg of messages) {
                await historyManager.addMessage(msg);
            }

            // Force optimization
            await historyManager.optimize();

            const context = await historyManager.getContext();
            expect(context).toContain('Third message');
            expect(context).toContain('Second message');
        });
    });

    describe('Environmental Context', () => {
        test('should integrate environmental context', async () => {
            // Set up environmental context
            const envContext = {
                timestamp: new Date().toISOString(),
                timezone: 'UTC',
                userPreferences: {
                    language: 'en',
                    theme: 'dark'
                }
            };

            // Add message with environmental context
            const message = createTestMessage('Test message');
            message.metadata = {
                ...message.metadata,
                environment: envContext
            };

            await historyManager.addMessage(message);

            // Verify context includes environmental information
            const context = await historyManager.getContext();
            expect(context).toContain('Test message');
            expect(context).toContain('UTC');
        });

        test('should update environmental context dynamically', async () => {
            // Simulate changing environment
            const contexts = [
                { time: '10:00', status: 'morning' },
                { time: '14:00', status: 'afternoon' },
                { time: '20:00', status: 'evening' }
            ];

            for (const ctx of contexts) {
                const message = createTestMessage(`Message at ${ctx.time}`);
                message.metadata = {
                    ...message.metadata,
                    environment: ctx
                };
                await historyManager.addMessage(message);
            }

            const context = await historyManager.getContext();
            expect(context).toContain('20:00');
            expect(context).toContain('evening');
        });
    });

    describe('Context Integration', () => {
        test('should combine different context sources', async () => {
            // Add conversation history
            await historyManager.addMessage(createTestMessage('User question'));
            
            // Add memory context
            const memoryContext = {
                type: MemoryType.SEMANTIC,
                content: 'Relevant background information'
            };
            await workingMemory.store({
                id: 'mem-1',
                content: memoryContext.content,
                type: memoryContext.type,
                metadata: { relevance: 0.8, timestamp: Date.now() }
            });

            // Add environmental context
            const envMessage = createTestMessage('Contextual message');
            envMessage.metadata = {
                ...envMessage.metadata,
                environment: { status: 'active' }
            };
            await historyManager.addMessage(envMessage);

            // Verify combined context
            const context = await historyManager.getContext();
            expect(context).toContain('User question');
            expect(context).toContain('Contextual message');
            expect(context).toContain('active');
        });

        test('should handle context conflicts', async () => {
            // Add conflicting information
            const messages = [
                createTestMessage('Initial value: A'),
                createTestMessage('Updated value: B'),
                createTestMessage('Final value: C')
            ];

            for (const msg of messages) {
                await historyManager.addMessage(msg);
            }

            // Verify most recent context is prioritized
            const context = await historyManager.getContext();
            const lines = context.split('\n');
            const lastLine = lines[lines.length - 1];
            expect(lastLine).toContain('Final value: C');
        });
    });
});
