import { expect, test, describe, beforeEach } from 'bun:test';
import { AgentMemorySystem } from '../../../src/core/memory/AgentMemorySystem';
import { MockMemoryStorage, MockMemoryIndex } from '../utils/test-helpers';
import { MemoryType, IMemoryUnit } from '../../../src/core/memory/types';

describe('Memory Optimization Features', () => {
    let memorySystem: AgentMemorySystem;
    let storage: MockMemoryStorage;
    let index: MockMemoryIndex;

    beforeEach(() => {
        storage = new MockMemoryStorage();
        index = new MockMemoryIndex();
        memorySystem = new AgentMemorySystem(storage, index);
    });

    describe('Memory Prioritization', () => {
        test('should prioritize memories by relevance', async () => {
            const memories: IMemoryUnit[] = [
                {
                    id: 'high-rel',
                    content: 'Highly relevant memory',
                    metadata: new Map<string, any>([
                        ['type', MemoryType.SEMANTIC],
                        ['relevance', 0.9],
                        ['timestamp', Date.now()],
                        ['tags', ['important']]
                    ]),
                    timestamp: new Date()
                },
                {
                    id: 'med-rel',
                    content: 'Medium relevance memory',
                    metadata: new Map<string, any>([
                        ['type', MemoryType.SEMANTIC],
                        ['relevance', 0.6],
                        ['timestamp', Date.now()],
                        ['tags', ['general']]
                    ]),
                    timestamp: new Date()
                },
                {
                    id: 'low-rel',
                    content: 'Low relevance memory',
                    metadata: new Map<string, any>([
                        ['type', MemoryType.SEMANTIC],
                        ['relevance', 0.3],
                        ['timestamp', Date.now()],
                        ['tags', ['misc']]
                    ]),
                    timestamp: new Date()
                }
            ];

            // Store memories
            for (const memory of memories) {
                await memorySystem.store(memory);
            }

            // Retrieve memories with relevance filter
            const retrievedMemories = await memorySystem.retrieveRelevantMemories('relevant', 0.5);

            // Verify order by relevance
            expect(retrievedMemories.length).toBe(2);
            expect(retrievedMemories[0].id).toBe('high-rel');
            expect(retrievedMemories[1].id).toBe('med-rel');
        });

        test('should consider recency in memory prioritization', async () => {
            const oldMemory: IMemoryUnit = {
                id: 'old',
                content: 'Old but relevant memory',
                metadata: new Map<string, any>([
                    ['type', MemoryType.SEMANTIC],
                    ['relevance', 0.8],
                    ['timestamp', Date.now() - 7 * 24 * 60 * 60 * 1000], // 7 days old
                    ['tags', ['important']]
                ]),
                timestamp: new Date()
            };

            const newMemory: IMemoryUnit = {
                id: 'new',
                content: 'New and relevant memory',
                metadata: new Map<string, any>([
                    ['type', MemoryType.SEMANTIC],
                    ['relevance', 0.8],
                    ['timestamp', Date.now()],
                    ['tags', ['important']]
                ]),
                timestamp: new Date()
            };

            await memorySystem.store(oldMemory);
            await memorySystem.store(newMemory);

            const memories = await memorySystem.retrieveRelevantMemories('important');
            expect(memories[0].id).toBe('new');
        });
    });

    describe('Memory Summarization', () => {
        test('should summarize memories when needed', async () => {
            // Create a series of related memories
            const memories: IMemoryUnit[] = Array.from({ length: 5 }, (_, i) => ({
                id: `mem-${i}`,
                content: `Memory content ${i}`,
                metadata: new Map<string, any>([
                    ['type', MemoryType.EPISODIC],
                    ['relevance', 0.7],
                    ['timestamp', Date.now() - i * 60 * 60 * 1000], // Each 1 hour apart
                    ['tags', ['series']]
                ]),
                timestamp: new Date()
            }));

            await Promise.all(memories.map(m => memorySystem.store(m)));

            // Request summarized memories
            const summarized = await memorySystem.retrieveSummarizedMemories('series');
            expect(summarized).toHaveLength(1);
            expect(summarized[0].content).toContain('Summary');
        });

        test('should maintain important details in summaries', async () => {
            const criticalMemory: IMemoryUnit = {
                id: 'critical',
                content: 'Critical system update required',
                metadata: new Map<string, any>([
                    ['type', MemoryType.SEMANTIC],
                    ['relevance', 1.0],
                    ['timestamp', Date.now()],
                    ['tags', ['critical', 'update']]
                ]),
                timestamp: new Date()
            };

            const contextMemory: IMemoryUnit = {
                id: 'context',
                content: 'System context information',
                metadata: new Map<string, any>([
                    ['type', MemoryType.SEMANTIC],
                    ['relevance', 0.7],
                    ['timestamp', Date.now()],
                    ['tags', ['context', 'update']]
                ]),
                timestamp: new Date()
            };

            await memorySystem.store(criticalMemory);
            await memorySystem.store(contextMemory);

            const summarized = await memorySystem.retrieveSummarizedMemories('update');
            expect(summarized[0].content).toContain('Critical');
            expect(summarized[0].metadata.get('relevance')).toBeGreaterThan(0.8);
        });
    });
});
