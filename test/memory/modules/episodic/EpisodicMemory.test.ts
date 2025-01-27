import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EpisodicMemory } from '../../../../src/core/memory/modules/episodic/EpisodicMemory';
import { InMemoryGraphStorage } from '../../../../src/core/memory/graph/data/InMemoryGraphStorage';
import { GraphLLMProcessor } from '../../../../src/core/memory/graph/processing/llm/processor';
import { IGraphIndex } from '../../../../src/core/memory/storage';
import { IEpisodicMemoryUnit } from '../../../../src/core/memory/modules/episodic/types';
import { MemoryType } from '../../../../src/core/memory/base';
import { EmotionalContext } from '../../../../src/core/memory/context';
import { EpisodicNodeType, EpisodicEdgeType } from '../../../../src/core/memory/modules/episodic/graph';

describe('EpisodicMemory', () => {
    let storage: InMemoryGraphStorage;
    let index: IGraphIndex;
    let llmProcessor: GraphLLMProcessor;
    let episodicMemory: EpisodicMemory;

    beforeEach(() => {
        storage = new InMemoryGraphStorage();
        index = {
            addToIndex: vi.fn(),
            search: vi.fn(),
            deleteFromIndex: vi.fn()
        };
        llmProcessor = {
            process: vi.fn(),
            llm: {},
            config: {}
        } as unknown as GraphLLMProcessor;
        
        episodicMemory = new EpisodicMemory(storage, index, llmProcessor);
    });

    describe('Memory Storage and Retrieval', () => {
        it('should store and retrieve a memory unit with graph integration', async () => {
            const emotions: EmotionalContext = {
                currentEmotion: { valence: 0.5, arousal: 0.7 },
                emotionalTrends: []
            };

            const memoryUnit: IEpisodicMemoryUnit = {
                id: 'test-id',
                content: {
                    timeSequence: Date.now(),
                    location: 'office',
                    actors: ['Alice', 'Bob'],
                    actions: ['discussing', 'planning'],
                    emotions,
                    coherenceScore: 0.8,
                    emotionalIntensity: 0.6,
                    contextualRelevance: 0.9,
                    temporalDistance: 0,
                    timestamp: new Date()
                },
                metadata: new Map([['priority', 'high']]),
                timestamp: new Date(),
                memoryType: MemoryType.EPISODIC,
                createdAt: new Date(),
                validAt: new Date()
            };

            await episodicMemory.store(memoryUnit);

            // Verify node creation
            const nodes = await storage.getNodes({
                nodeTypes: [EpisodicNodeType.EPISODE]
            });
            expect(nodes).toHaveLength(1);
            expect(nodes[0].id).toBe(memoryUnit.id);

            // Verify location node and edge
            const locationNodes = await storage.getNodes({
                nodeTypes: [EpisodicNodeType.LOCATION]
            });
            expect(locationNodes).toHaveLength(1);
            expect(locationNodes[0].content.name).toBe('office');

            // Verify actor nodes and edges
            const actorNodes = await storage.getNodes({
                nodeTypes: [EpisodicNodeType.ACTOR]
            });
            expect(actorNodes).toHaveLength(2);
            expect(actorNodes.map(n => n.content.name)).toContain('Alice');
            expect(actorNodes.map(n => n.content.name)).toContain('Bob');

            // Verify action nodes and edges
            const actionNodes = await storage.getNodes({
                nodeTypes: [EpisodicNodeType.ACTION]
            });
            expect(actionNodes).toHaveLength(2);
            expect(actionNodes.map(n => n.content.name)).toContain('discussing');
            expect(actionNodes.map(n => n.content.name)).toContain('planning');

            // Verify edges
            const edges = await storage.getEdges({});
            expect(edges).toHaveLength(5); // 1 location + 2 actors + 2 actions
            expect(edges.some(e => e.type === EpisodicEdgeType.HAPPENED_AT)).toBe(true);
            expect(edges.filter(e => e.type === EpisodicEdgeType.INVOLVES)).toHaveLength(2);
            expect(edges.filter(e => e.type === EpisodicEdgeType.CONTAINS)).toHaveLength(2);
        });

        it('should find related memories through graph traversal', async () => {
            // Store two related memories
            const memory1: IEpisodicMemoryUnit = {
                id: 'memory1',
                content: {
                    timeSequence: Date.now(),
                    location: 'office',
                    actors: ['Alice'],
                    actions: ['working'],
                    emotions: {
                        currentEmotion: { valence: 0.5, arousal: 0.5 },
                        emotionalTrends: []
                    },
                    coherenceScore: 0.8,
                    emotionalIntensity: 0.6,
                    contextualRelevance: 0.9,
                    temporalDistance: 0,
                    timestamp: new Date()
                },
                metadata: new Map(),
                timestamp: new Date(),
                memoryType: MemoryType.EPISODIC,
                createdAt: new Date(),
                validAt: new Date()
            };

            const memory2: IEpisodicMemoryUnit = {
                id: 'memory2',
                content: {
                    timeSequence: Date.now() + 1000,
                    location: 'office',
                    actors: ['Alice'],
                    actions: ['meeting'],
                    emotions: {
                        currentEmotion: { valence: 0.6, arousal: 0.6 },
                        emotionalTrends: []
                    },
                    coherenceScore: 0.8,
                    emotionalIntensity: 0.6,
                    contextualRelevance: 0.9,
                    temporalDistance: 0,
                    timestamp: new Date()
                },
                metadata: new Map(),
                timestamp: new Date(),
                memoryType: MemoryType.EPISODIC,
                createdAt: new Date(),
                validAt: new Date()
            };

            await episodicMemory.store(memory1);
            await episodicMemory.store(memory2);

            // Find related memories
            const related = await episodicMemory.findRelatedMemories('memory1');
            expect(related).toHaveLength(1);
            expect(related[0].id).toBe('memory2');
        });

        it('should handle text-based queries using graph search', async () => {
            const memory: IEpisodicMemoryUnit = {
                id: 'test-memory',
                content: {
                    timeSequence: Date.now(),
                    location: 'conference room',
                    actors: ['Alice', 'Team'],
                    actions: ['presenting', 'discussing'],
                    emotions: {
                        currentEmotion: { valence: 0.7, arousal: 0.8 },
                        emotionalTrends: []
                    },
                    coherenceScore: 0.9,
                    emotionalIntensity: 0.7,
                    contextualRelevance: 0.8,
                    temporalDistance: 0,
                    timestamp: new Date(),
                    userInstruction: 'Team presentation about the new project'
                },
                metadata: new Map(),
                timestamp: new Date(),
                memoryType: MemoryType.EPISODIC,
                createdAt: new Date(),
                validAt: new Date()
            };

            await episodicMemory.store(memory);

            // Query using text
            const results = await episodicMemory.query({
                query: 'team presentation'
            });

            expect(results).toHaveLength(1);
            expect(results[0].id).toBe('test-memory');
            expect(results[0].content.userInstruction).toContain('Team presentation');
        });

        it('should maintain temporal relationships between memories', async () => {
            const baseTime = Date.now();
            
            // Create three memories in sequence
            const memories = await Promise.all([
                episodicMemory.store({
                    id: 'memory1',
                    content: {
                        timeSequence: baseTime,
                        location: 'office',
                        actors: ['Alice'],
                        actions: ['arriving'],
                        emotions: {
                            currentEmotion: { valence: 0.5, arousal: 0.5 },
                            emotionalTrends: []
                        },
                        coherenceScore: 0.8,
                        emotionalIntensity: 0.6,
                        contextualRelevance: 0.9,
                        temporalDistance: 0,
                        timestamp: new Date(baseTime)
                    },
                    metadata: new Map(),
                    timestamp: new Date(baseTime),
                    memoryType: MemoryType.EPISODIC,
                    createdAt: new Date(baseTime),
                    validAt: new Date(baseTime)
                }),
                episodicMemory.store({
                    id: 'memory2',
                    content: {
                        timeSequence: baseTime + 3600000, // 1 hour later
                        location: 'office',
                        actors: ['Alice'],
                        actions: ['working'],
                        emotions: {
                            currentEmotion: { valence: 0.6, arousal: 0.6 },
                            emotionalTrends: []
                        },
                        coherenceScore: 0.8,
                        emotionalIntensity: 0.6,
                        contextualRelevance: 0.9,
                        temporalDistance: 0,
                        timestamp: new Date(baseTime + 3600000)
                    },
                    metadata: new Map(),
                    timestamp: new Date(baseTime + 3600000),
                    memoryType: MemoryType.EPISODIC,
                    createdAt: new Date(baseTime + 3600000),
                    validAt: new Date(baseTime + 3600000)
                }),
                episodicMemory.store({
                    id: 'memory3',
                    content: {
                        timeSequence: baseTime + 7200000, // 2 hours later
                        location: 'office',
                        actors: ['Alice'],
                        actions: ['leaving'],
                        emotions: {
                            currentEmotion: { valence: 0.7, arousal: 0.4 },
                            emotionalTrends: []
                        },
                        coherenceScore: 0.8,
                        emotionalIntensity: 0.6,
                        contextualRelevance: 0.9,
                        temporalDistance: 0,
                        timestamp: new Date(baseTime + 7200000)
                    },
                    metadata: new Map(),
                    timestamp: new Date(baseTime + 7200000),
                    memoryType: MemoryType.EPISODIC,
                    createdAt: new Date(baseTime + 7200000),
                    validAt: new Date(baseTime + 7200000)
                })
            ]);

            // Verify temporal edges
            const edges = await storage.getEdges({
                edgeTypes: [EpisodicEdgeType.FOLLOWS]
            });

            // Should have 2 FOLLOWS edges (memory1->memory2 and memory2->memory3)
            expect(edges.filter(e => e.type === EpisodicEdgeType.FOLLOWS)).toHaveLength(2);

            // Verify we can traverse from first to last memory
            const related = await episodicMemory.findRelatedMemories('memory1');
            expect(related.map(m => m.id)).toContain('memory2');
            expect(related.map(m => m.id)).toContain('memory3');
        });
    });
});
