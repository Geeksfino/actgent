import { expect, test, describe, beforeEach } from 'bun:test';
import { AgentMemorySystem } from '../../../src/core/memory/AgentMemorySystem';
import { MockMemoryStorage, MockMemoryIndex } from '../utils/test-helpers';
import { MemoryType, IMemoryUnit, MemoryFilter } from '../../../src/core/memory/types';

describe('Memory System Integration', () => {
    let memorySystem: AgentMemorySystem;
    let storage: MockMemoryStorage;
    let index: MockMemoryIndex;

    beforeEach(() => {
        storage = new MockMemoryStorage();
        index = new MockMemoryIndex();
        memorySystem = new AgentMemorySystem(storage, index);
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

            // Check if it's been transferred to episodic memory
            const filter: MemoryFilter = {
                types: [MemoryType.EPISODIC],
                metadataFilters: [new Map<string, any>([['source', 'working_memory']])]
            };

            const episodicResult = await memorySystem.retrieveEpisodicMemories(filter);
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

            await memorySystem.storeEpisodicMemory(episodicMemory1.content, episodicMemory1.metadata);
            await memorySystem.storeWorkingMemory(workingMemory1.content, workingMemory1.metadata);

            // Retrieve associated memories with specific filter
            const filter: MemoryFilter = {
                types: [MemoryType.EPISODIC, MemoryType.WORKING],
                query: 'project X'
            };

            const relatedMemories = await memorySystem.retrieveEpisodicMemories(filter);
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

            await memorySystem.storeWorkingMemory(workingContent.content, workingContent.metadata);
            await memorySystem.storeLongTerm(longTermContent.content, longTermContent.metadata);

            const filter: MemoryFilter = {
                query: 'task info'
            };

            const results = await memorySystem.retrieveWorkingMemories(filter);
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

            const filter: MemoryFilter = {
                query: 'info'
            };

            const results = await memorySystem.retrieveWorkingMemories(filter);
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

            await memorySystem.storeLongTerm(originalMemory.content, originalMemory.metadata);

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

            await memorySystem.storeLongTerm(updatedMemory.content, updatedMemory.metadata);

            // Check if update is reflected in both working and semantic memory
            const workingFilter: MemoryFilter = {
                ids: ['mem-1']
            };

            const semanticFilter: MemoryFilter = {
                ids: ['mem-1']
            };

            const workingResult = await memorySystem.retrieveWorkingMemories(workingFilter);
            const semanticResult = await memorySystem.retrieveLongTerm(semanticFilter);

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

            await memorySystem.storeWorkingMemory(baseMemory.content, baseMemory.metadata);

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
                memorySystem.storeWorkingMemory(update1.content, update1.metadata),
                new Promise(resolve => setTimeout(resolve, 10)).then(() => memorySystem.storeWorkingMemory(update2.content, update2.metadata))
            ]);

            const filter: MemoryFilter = {
                ids: ['conflict-1']
            };

            const result = await memorySystem.retrieveWorkingMemories(filter);
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
            const filter: MemoryFilter = {
                types: [MemoryType.WORKING]
            };

            let result = await memorySystem.retrieveWorkingMemories(filter);
            expect(result.length).toBe(1);

            // Wait for expiration
            await new Promise(resolve => setTimeout(resolve, 200));

            // Force cleanup
            await (memorySystem as any).workingMemory.cleanup(true);

            // Wait for cleanup to complete
            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify it's been cleaned up
            result = await memorySystem.retrieveWorkingMemories(filter);
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
            await memorySystem.consolidateWorkingMemory();

            // Wait for consolidation to complete
            await new Promise(resolve => setTimeout(resolve, 100));

            // Check if less accessed memories are affected
            const leastAccessedFilter: MemoryFilter = {
                types: [MemoryType.EPISODIC],
                query: 'Content 0'
            };

            const mostAccessedFilter: MemoryFilter = {
                types: [MemoryType.EPISODIC],
                query: 'Content 4'
            };

            const leastAccessed = await memorySystem.retrieveEpisodicMemories(leastAccessedFilter);
            const mostAccessed = await memorySystem.retrieveEpisodicMemories(mostAccessedFilter);

            expect(leastAccessed[0]?.metadata.get('optimized')).toBeTruthy();
            expect(mostAccessed[0]?.metadata.get('optimized')).toBeFalsy();
        });
    });
});
