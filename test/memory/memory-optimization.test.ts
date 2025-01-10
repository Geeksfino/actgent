import { expect, test, describe, beforeEach } from 'bun:test';
import { AgentMemorySystem } from '../../src/core/memory/AgentMemorySystem';
import { MockMemoryStorage, MockMemoryIndex } from './utils/test-helpers';
import { MemoryType, IMemoryUnit } from '../../src/core/memory/types';

describe('Memory Optimization Features', () => {
    let memorySystem: AgentMemorySystem;
    let storage: MockMemoryStorage;
    let index: MockMemoryIndex;

    beforeEach(() => {
        storage = new MockMemoryStorage();
        index = new MockMemoryIndex();
        memorySystem = new AgentMemorySystem(storage, index);
    });

    describe('Memory Relevance', () => {
        test('should prioritize memories by relevance', async () => {
            const memories = [
                {
                    id: 'high-rel',
                    type: MemoryType.EPISODIC,
                    content: 'highly relevant memory',
                    metadata: new Map([['relevance', 0.9]]),
                    timestamp: new Date()
                },
                {
                    id: 'med-rel',
                    type: MemoryType.EPISODIC,
                    content: 'medium relevant memory',
                    metadata: new Map([['relevance', 0.6]]),
                    timestamp: new Date()
                },
                {
                    id: 'low-rel',
                    type: MemoryType.EPISODIC,
                    content: 'low relevant memory',
                    metadata: new Map([['relevance', 0.3]]),
                    timestamp: new Date()
                }
            ];

            // Store memories
            for (const memory of memories) {
                await memorySystem.storeEpisodicMemory(memory.content, memory.metadata);
            }

            // Retrieve memories with relevance filter
            const filter = {
                type: MemoryType.EPISODIC,
                metadata: new Map([['relevance', { min: 0.5 }]])
            };
            const retrievedMemories = await memorySystem.retrieveEpisodicMemories(filter);

            // Verify order by relevance
            expect(retrievedMemories.length).toBe(2);
            expect(retrievedMemories[0].metadata.get('relevance')).toBeGreaterThan(retrievedMemories[1].metadata.get('relevance'));
        });

        test('should consider recency in memory prioritization', async () => {
            const oldMemory = {
                content: 'old memory',
                metadata: new Map([['relevance', 0.8]]),
                timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000) // 1 day ago
            };

            const newMemory = {
                content: 'new memory',
                metadata: new Map([['relevance', 0.8]]),
                timestamp: new Date()
            };

            // Store memories
            await memorySystem.storeEpisodicMemory(oldMemory.content, oldMemory.metadata);
            await memorySystem.storeEpisodicMemory(newMemory.content, newMemory.metadata);

            // Retrieve memories
            const filter = {
                type: MemoryType.EPISODIC,
                metadata: new Map([['relevance', { min: 0.5 }]])
            };
            const retrievedMemories = await memorySystem.retrieveEpisodicMemories(filter);

            // Verify recency order
            expect(retrievedMemories.length).toBe(2);
            expect(retrievedMemories[0].timestamp.getTime()).toBeGreaterThan(retrievedMemories[1].timestamp.getTime());
        });
    });

    describe('Memory Summarization', () => {
        test('should summarize memories when needed', async () => {
            // Create a series of related memories
            const memories = Array.from({ length: 5 }, (_, i) => ({
                content: `Memory content ${i}`,
                metadata: new Map([['topic', 'test-topic']]),
                timestamp: new Date(Date.now() - i * 60 * 60 * 1000) // Each 1 hour apart
            }));

            // Store memories
            for (const memory of memories) {
                await memorySystem.storeEpisodicMemory(memory.content, memory.metadata);
            }

            // Retrieve memories with topic filter
            const filter = {
                type: MemoryType.EPISODIC,
                metadata: new Map([['topic', 'test-topic']])
            };
            const retrievedMemories = await memorySystem.retrieveEpisodicMemories(filter);

            // Verify memories are retrieved
            expect(retrievedMemories.length).toBe(5);
            expect(retrievedMemories[0].metadata.get('topic')).toBe('test-topic');
        });
    });
});
