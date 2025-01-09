import { expect, test, describe, beforeEach } from 'bun:test';
import { AgentMemorySystem } from '../../../src/core/memory/AgentMemorySystem';
import { WorkingMemory } from '../../../src/core/memory/WorkingMemory';
import { LongTermMemory } from '../../../src/core/memory/LongTermMemory';
import { EpisodicMemory } from '../../../src/core/memory/EpisodicMemory';
import { MockMemoryStorage, MockMemoryIndex } from '../utils/test-helpers';
import { MemoryType, IMemoryUnit, MemoryFilter } from '../../../src/core/memory/types';

describe('Memory System Integration', () => {
    let memorySystem: AgentMemorySystem;
    let workingMemory: WorkingMemory;
    let longTermMemory: LongTermMemory;
    let episodicMemory: EpisodicMemory;
    let storage: MockMemoryStorage;
    let index: MockMemoryIndex;

    beforeEach(() => {
        storage = new MockMemoryStorage();
        index = new MockMemoryIndex();
        workingMemory = new WorkingMemory(storage, index);
        longTermMemory = new LongTermMemory(storage, index);
        episodicMemory = new EpisodicMemory(storage, index);
        memorySystem = new AgentMemorySystem(storage, index);

        // Initialize memory systems with correct index
        workingMemory.setIndex(index);
        longTermMemory.setIndex(index);
        episodicMemory.setIndex(index);
        memorySystem.setIndex(index);
    });

    describe('Memory Type Coordination', () => {
        test('should handle memory transfer between working and long-term memory', async () => {
            const content = 'Test memory content';
            const metadata = new Map<string, any>([
                ['priority', 0.5],
                ['contextKey', 'task'],
                ['consolidate', true]
            ]);

            // Store in working memory
            await memorySystem.storeWorkingMemory(content, metadata);

            // Wait for consolidation
            await new Promise(resolve => setTimeout(resolve, 100));

            // Force consolidation
            await memorySystem.consolidateEpisodicMemory();

            // Wait for consolidation to complete
            await new Promise(resolve => setTimeout(resolve, 100));

            // Check if it's been transferred to episodic memory
            const episodicResult = await episodicMemory.retrieve({
                types: [MemoryType.EPISODIC],
                metadataFilters: [new Map<string, any>([['source', 'working_memory']])]
            });

            expect(episodicResult.length).toBe(1);
            expect(episodicResult[0].content).toBe(content);
            expect(episodicResult[0].metadata.get('source')).toBe('working_memory');
        });

        test('should maintain associations across memory types', async () => {
            // Create related memories in different types
            const episodicMemory1: IMemoryUnit = {
                id: 'ep-1',
                content: 'Meeting about project X',
                metadata: new Map<string, any>([
                    ['type', MemoryType.EPISODIC],
                    ['project', 'X'],
                    ['query', 'project X'],
                    ['relevance', 0.9]
                ]),
                timestamp: new Date()
            };

            const workingMemory1: IMemoryUnit = {
                id: 'work-1',
                content: 'Current task for project X',
                metadata: new Map<string, any>([
                    ['type', MemoryType.WORKING],
                    ['project', 'X'],
                    ['associatedWith', ['ep-1']],
                    ['query', 'project X'],
                    ['relevance', 0.8],
                    ['expiresAt', Date.now() + 1000]
                ]),
                timestamp: new Date()
            };

            await memorySystem.store(episodicMemory1);
            await memorySystem.store(workingMemory1);

            // Retrieve associated memories with specific filter
            const relatedMemories = await memorySystem.retrieve({
                types: [MemoryType.EPISODIC, MemoryType.WORKING],
                query: 'project X'
            });
            expect(relatedMemories.length).toBe(2);
            expect(relatedMemories.map(m => m.id).sort()).toEqual(['ep-1', 'work-1'].sort());
        });
    });

    describe('Memory Retrieval Prioritization', () => {
        test('should prioritize working memory over long-term memory for recent queries', async () => {
            const workingContent: IMemoryUnit = {
                id: 'recent-1',
                content: 'Recent task info',
                metadata: new Map<string, any>([
                    ['type', MemoryType.WORKING],
                    ['relevance', 0.8],
                    ['timestamp', new Date()]
                ]),
                timestamp: new Date()
            };

            const longTermContent: IMemoryUnit = {
                id: 'old-1',
                content: 'Old task info',
                metadata: new Map<string, any>([
                    ['type', MemoryType.SEMANTIC],
                    ['relevance', 0.9],
                    ['timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000)]
                ]),
                timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000)
            };

            await memorySystem.store(workingContent);
            await memorySystem.store(longTermContent);

            const results = await memorySystem.retrieveRelevantMemories('task info');
            expect(results[0].id).toBe('recent-1');
        });

        test('should combine and prioritize memories based on context relevance', async () => {
            // Store test memories
            await memorySystem.storeWorkingMemory('Some task info', new Map<string, string>([
                ['priority', '0.5'],
                ['contextKey', 'task']
            ]));

            await memorySystem.storeWorkingMemory('Important context info', new Map<string, string>([
                ['priority', '0.8'],
                ['contextKey', 'task']
            ]));

            // Wait for memories to be processed
            await new Promise(resolve => setTimeout(resolve, 100));

            const results = await memorySystem.retrieveRelevantMemories('info');
            expect(results.length).toBeGreaterThan(0);
            expect(results[0].metadata.get('priority')).toBe('0.8');
        });
    });

    describe('Memory Update Propagation', () => {
        test('should propagate updates across memory types', async () => {
            const originalMemory: IMemoryUnit = {
                id: 'mem-1',
                content: 'Original content',
                metadata: new Map<string, any>([
                    ['type', MemoryType.SEMANTIC],
                    ['version', 1]
                ]),
                timestamp: new Date()
            };

            await memorySystem.store(originalMemory);

            // Update the memory
            const updatedMemory = {
                ...originalMemory,
                content: 'Updated content',
                metadata: new Map<string, any>([
                    ['type', MemoryType.SEMANTIC],
                    ['version', 2]
                ]),
                timestamp: new Date()
            };

            await memorySystem.store(updatedMemory);

            // Check if update is reflected in both working and semantic memory
            const workingResult = await workingMemory.retrieve({
                ids: ['mem-1']
            });
            const semanticResult = await longTermMemory.retrieve({
                ids: ['mem-1']
            });

            expect(workingResult.length).toBe(0); // Should be moved to semantic
            expect(semanticResult[0]?.content).toBe('Updated content');
        });

        test('should handle conflicting updates correctly', async () => {
            const baseMemory: IMemoryUnit = {
                id: 'conflict-1',
                content: 'Base content',
                metadata: new Map<string, any>([
                    ['type', MemoryType.WORKING],
                    ['version', 1]
                ]),
                timestamp: new Date()
            };

            await memorySystem.store(baseMemory);

            // Create conflicting updates
            const update1: IMemoryUnit = {
                ...baseMemory,
                content: 'Update 1',
                metadata: new Map<string, any>([
                    ['type', MemoryType.WORKING],
                    ['version', 2]
                ]),
                timestamp: new Date()
            };

            const update2: IMemoryUnit = {
                ...baseMemory,
                content: 'Update 2',
                metadata: new Map<string, any>([
                    ['type', MemoryType.WORKING],
                    ['version', 2]
                ]),
                timestamp: new Date()
            };

            // Store updates with small delay to simulate concurrent updates
            await Promise.all([
                memorySystem.store(update1),
                new Promise(resolve => setTimeout(resolve, 10)).then(() => memorySystem.store(update2))
            ]);

            const result = await memorySystem.retrieve({
                ids: ['conflict-1']
            });
            expect(result[0]?.content).toBe('Update 2'); // Last write wins
        });
    });

    describe('Memory Cleanup and Optimization', () => {
        test('should cleanup expired working memories', async () => {
            // Store a memory with expiration
            const expiresAt = Date.now() + 100; // Expires in 100ms
            await memorySystem.storeWorkingMemory('Ephemeral content', new Map<string, any>([
                ['expiresAt', expiresAt]
            ]));

            // Verify it exists
            let result = await memorySystem.retrieve({
                types: [MemoryType.WORKING]
            });
            expect(result.length).toBe(1);

            // Wait for expiration
            await new Promise(resolve => setTimeout(resolve, 200));

            // Force cleanup
            await (memorySystem as any).workingMemory.cleanup(true);

            // Wait for cleanup to complete
            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify it's been cleaned up
            result = await memorySystem.retrieve({
                types: [MemoryType.WORKING]
            });
            expect(result.length).toBe(0);
        });

        test('should optimize memory storage based on access patterns', async () => {
            // Create test memories with different access counts
            const memories = Array.from({ length: 5 }, (_, i) => ({
                id: `opt-${i}`,
                content: `Content ${i}`,
                metadata: new Map<string, any>([
                    ['type', MemoryType.WORKING],
                    ['priority', 0.5],
                    ['accessCount', i],
                    ['lastAccessed', new Date(Date.now() - i * 1000)],
                    ['optimized', false]
                ]),
                timestamp: new Date()
            }));

            // Store memories
            await Promise.all(memories.map(memory => 
                memorySystem.storeWorkingMemory(memory.content, memory.metadata)
            ));

            // Wait for optimization
            await new Promise(resolve => setTimeout(resolve, 100));

            // Force consolidation
            await memorySystem.consolidateEpisodicMemory();

            // Wait for consolidation to complete
            await new Promise(resolve => setTimeout(resolve, 100));

            // Check if less accessed memories are affected
            const leastAccessed = await episodicMemory.retrieve({
                types: [MemoryType.EPISODIC],
                query: 'Content 0'
            });
            const mostAccessed = await episodicMemory.retrieve({
                types: [MemoryType.EPISODIC],
                query: 'Content 4'
            });

            expect(leastAccessed[0]?.metadata.get('optimized')).toBeTruthy();
            expect(mostAccessed[0]?.metadata.get('optimized')).toBeFalsy();
        });
    });
});
