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
            const projectMemory: IMemoryUnit = {
                id: 'proj-x-1',
                content: 'Project X is a software initiative focusing on AI',
                type: MemoryType.SEMANTIC,
                metadata: {
                    relevance: 0.9,
                    timestamp: Date.now(),
                    tags: ['project-x', 'software']
                }
            };
            await memorySystem.store(projectMemory);

            // 3. Retrieve relevant context
            const memories = await memorySystem.retrieveRelevantMemories('project X');
            expect(memories).toContainEqual(expect.objectContaining({
                id: 'proj-x-1'
            }));

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
            const goalsMemory: IMemoryUnit = {
                id: 'proj-x-goals',
                content: 'Project X aims to develop advanced AI systems',
                type: MemoryType.SEMANTIC,
                metadata: {
                    relevance: 0.95,
                    timestamp: Date.now(),
                    tags: ['project-x', 'goals']
                }
            };
            await memorySystem.store(goalsMemory);

            // 3. Verify context maintenance
            const context = await historyManager.getContext();
            expect(context).toContain('Project X is an AI initiative');
            expect(context).toContain('What were its main goals?');

            // 4. Verify memory integration
            const relevantMemories = await memorySystem.retrieveRelevantMemories('project X goals');
            expect(relevantMemories).toContainEqual(expect.objectContaining({
                id: 'proj-x-goals'
            }));
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
            const consolidatedMemory: IMemoryUnit = {
                id: 'consolidated-1',
                content: 'Summary of previous discussion about project updates',
                type: MemoryType.EPISODIC,
                metadata: {
                    relevance: 0.8,
                    timestamp: Date.now(),
                    tags: ['project-update', 'summary']
                }
            };
            await memorySystem.store(consolidatedMemory);

            const memories = await memorySystem.retrieveRelevantMemories('project update');
            expect(memories).toContainEqual(expect.objectContaining({
                id: 'consolidated-1'
            }));
        });
    });
});
