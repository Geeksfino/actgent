import { expect, test, describe, beforeEach } from 'bun:test';
import { AgentMemorySystem } from '../../../src/core/memory/AgentMemorySystem';
import { SmartHistoryManager } from '../../../src/core/context/SmartHistoryManager';
import { WorkingMemory } from '../../../src/core/memory/WorkingMemory';
import { MockMemoryStorage, MockMemoryIndex } from '../utils/test-helpers';
import { createTestMessage, MockContextOptimizer, MockRelevanceOptimizer } from '../../context/utils/test-helpers';
import { MemoryType, IMemoryUnit } from '../../../src/core/memory/types';

// Mock LLM for testing
class MockLLM {
    async generate(prompt: string): Promise<string> {
        return `Response to: ${prompt.slice(0, 20)}...`;
    }
}

describe('Memory-Context Integration Flow', () => {
    let memorySystem: AgentMemorySystem;
    let historyManager: SmartHistoryManager;
    let storage: MockMemoryStorage;
    let index: MockMemoryIndex;
    let workingMemory: WorkingMemory;
    let llm: MockLLM;

    beforeEach(() => {
        storage = new MockMemoryStorage();
        index = new MockMemoryIndex();
        workingMemory = new WorkingMemory(storage, index);
        memorySystem = new AgentMemorySystem(storage, index);
        historyManager = new SmartHistoryManager(workingMemory);
        llm = new MockLLM();

        // Set up optimizers
        (historyManager as any).optimizers.set('relevance', new MockRelevanceOptimizer());
        (historyManager as any).optimizers.set('context', new MockContextOptimizer(0.5));
    });

    describe('End-to-End Memory Flow', () => {
        test('should handle complete conversation workflow', async () => {
            // 1. Initial user message
            const userMessage = createTestMessage('Tell me about project X');
            await historyManager.addMessage(userMessage);

            // 2. Store some relevant memories
            const metadata = new Map<string, string>([
                ['type', MemoryType.SEMANTIC],
                ['tags', 'project-x,software']
            ]);
            await memorySystem.storeEpisodicMemory('Project X is a software initiative focusing on AI', metadata);

            // 3. Retrieve relevant context
            const filter = {
                types: [MemoryType.SEMANTIC],
                metadataFilters: [new Map([['tags', 'project-x']])]
            };
            const memories = await memorySystem.retrieveEpisodicMemories(filter);
            expect(memories.length).toBe(1);
            expect(memories[0].metadata.get('tags')).toBe('project-x,software');

            // 4. Construct context
            const context = await historyManager.getContext();
            expect(context).toContain('Tell me about project X');

            // 5. Simulate LLM response
            const llmResponse = await llm.generate(context);
            const assistantMessage = createTestMessage(llmResponse, 'assistant');
            await historyManager.addMessage(assistantMessage);

            // 6. Verify memory updates
            const updatedContext = await historyManager.getContext();
            expect(updatedContext).toContain(llmResponse);
        });

        test('should manage context across multiple turns', async () => {
            // 1. First turn
            const firstMessage = createTestMessage('What is project X?');
            await historyManager.addMessage(firstMessage);
            const firstResponse = createTestMessage('Project X is an AI initiative', 'assistant');
            await historyManager.addMessage(firstResponse);

            // 2. Second turn with memory consolidation
            const secondMessage = createTestMessage('What were its main goals?');
            await historyManager.addMessage(secondMessage);

            // Store additional context in memory
            const metadata = new Map<string, string>([
                ['type', MemoryType.SEMANTIC],
                ['tags', 'project-x,goals']
            ]);
            await memorySystem.storeEpisodicMemory('Project X aims to develop advanced AI systems', metadata);

            // 3. Verify context maintenance
            const context = await historyManager.getContext();
            expect(context).toContain('Project X is an AI initiative');
            expect(context).toContain('What were its main goals?');

            // 4. Verify memory integration
            const filter = {
                types: [MemoryType.SEMANTIC],
                metadataFilters: [new Map([['tags', 'project-x']])]
            };
            const relevantMemories = await memorySystem.retrieveEpisodicMemories(filter);
            expect(relevantMemories.length).toBe(2);
        });

        test('should handle memory consolidation and optimization', async () => {
            // 1. Add multiple messages to trigger optimization
            for (let i = 0; i < 10; i++) {
                const message = createTestMessage(`Message ${i}`, 'user', 0.5 + i * 0.05);
                await historyManager.addMessage(message);
            }

            // 2. Add a highly relevant message
            const importantMessage = createTestMessage('Critical project update', 'user', 0.9);
            await historyManager.addMessage(importantMessage);

            // 3. Trigger optimization
            await historyManager.optimize();

            // 4. Verify optimization results
            const context = await historyManager.getContext();
            expect(context).toContain('Critical project update');
            expect(context.split('\n').length).toBeLessThan(10); // Some messages should be filtered out

            // 5. Check memory consolidation
            const metadata = new Map<string, string>([
                ['type', MemoryType.EPISODIC],
                ['tags', 'project-update,summary']
            ]);
            await memorySystem.storeEpisodicMemory('Summary of previous discussion about project updates', metadata);

            const filter = {
                types: [MemoryType.EPISODIC],
                metadataFilters: [new Map([['tags', 'project-update']])]
            };
            const memories = await memorySystem.retrieveEpisodicMemories(filter);
            expect(memories.length).toBe(1);
        });
    });
});
