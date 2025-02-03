import { describe, it, expect } from 'vitest';
import { BenchmarkRunner } from './runner';
import { BenchmarkConversation } from './types';
import { GraphNodeType } from '../../../src/core/memory/graph/data/types';

describe('LongMemEval Benchmark', () => {
    const runner = new BenchmarkRunner();

    it('should handle long-term information retrieval', async () => {
        // Sample conversation with long-term dependencies
        const conversation: BenchmarkConversation = {
            id: 'long_conversation_1',
            messages: [
                {
                    id: 'msg1',
                    content: 'My favorite color is blue',
                    timestamp: new Date('2024-01-01T10:00:00Z'),
                    metadata: { 
                        type: 'preference',
                        entities: ['color_blue']
                    }
                },
                {
                    id: 'msg2',
                    content: 'I live in San Francisco',
                    timestamp: new Date('2024-01-01T10:05:00Z'),
                    metadata: { 
                        type: 'location',
                        entities: ['location_sf']
                    }
                },
                // Add many messages in between
                {
                    id: 'msg50',
                    content: "Let's talk about something else",
                    timestamp: new Date('2024-01-02T15:00:00Z')
                },
                // More recent message referencing old information
                {
                    id: 'msg51',
                    content: 'The weather in San Francisco is nice today',
                    timestamp: new Date('2024-01-02T15:05:00Z'),
                    metadata: { 
                        type: 'location',
                        entities: ['location_sf']
                    }
                }
            ],
            queries: [
                {
                    query: 'What is my favorite color?',
                    expectedResults: ['msg1'],
                    metadata: {
                        entities: ['color_blue']
                    }
                },
                {
                    query: 'Where do I live?',
                    expectedResults: ['msg2', 'msg51'],
                    metadata: {
                        entities: ['location_sf']
                    }
                }
            ]
        };

        const metrics = await runner.runBenchmark(conversation);
        
        // Assert high recall for long-term memory retrieval
        for (const metric of metrics) {
            expect(metric.recall).toBeGreaterThan(0.8);
            expect(metric.precision).toBeGreaterThan(0.7);
            expect(metric.mrr).toBeGreaterThan(0.5);
        }
    });

    it('should handle temporal evolution of information', async () => {
        const conversation: BenchmarkConversation = {
            id: 'temporal_evolution_1',
            messages: [
                {
                    id: 'msg1',
                    content: 'I work at Company A',
                    timestamp: new Date('2024-01-01T10:00:00Z'),
                    metadata: { 
                        type: 'employment',
                        entities: ['company_a']
                    }
                },
                {
                    id: 'msg2',
                    content: 'I just got a new job at Company B',
                    timestamp: new Date('2024-01-15T14:00:00Z'),
                    metadata: { 
                        type: 'employment',
                        entities: ['company_b']
                    }
                }
            ],
            queries: [
                {
                    query: 'Where did I work on January 1st?',
                    expectedResults: ['msg1'],
                    metadata: {
                        temporal: {
                            validAt: new Date('2024-01-01T12:00:00Z')
                        },
                        entities: ['company_a']
                    }
                },
                {
                    query: 'Where do I work now?',
                    expectedResults: ['msg2'],
                    metadata: {
                        temporal: {
                            validAt: new Date('2024-01-20T12:00:00Z')
                        },
                        entities: ['company_b']
                    }
                }
            ]
        };

        const metrics = await runner.runBenchmark(conversation);
        
        // Assert perfect recall for temporal queries
        for (const metric of metrics) {
            expect(metric.recall).toBe(1.0);
            expect(metric.precision).toBe(1.0);
        }
    });

    it('should evaluate semantic search capabilities', async () => {
        // This test includes embeddings for semantic search
        const conversation: BenchmarkConversation = {
            id: 'semantic_search_1',
            messages: [
                {
                    id: 'msg1',
                    content: 'The capital of France is Paris',
                    embedding: [0.1, 0.2, 0.3],
                    timestamp: new Date('2024-01-01T10:00:00Z'),
                    metadata: {
                        entities: ['location_paris', 'country_france']
                    }
                },
                {
                    id: 'msg2',
                    content: 'Paris is known for the Eiffel Tower',
                    embedding: [0.15, 0.25, 0.35],
                    timestamp: new Date('2024-01-01T10:05:00Z'),
                    metadata: {
                        entities: ['location_paris', 'landmark_eiffel']
                    }
                }
            ],
            queries: [
                {
                    query: 'Tell me about Paris',
                    embedding: [0.12, 0.22, 0.32],
                    expectedResults: ['msg1', 'msg2'],
                    metadata: {
                        entities: ['location_paris']
                    }
                }
            ]
        };

        const metrics = await runner.runBenchmark(conversation);
        
        // Assert high semantic search accuracy
        for (const metric of metrics) {
            expect(metric.recall).toBeGreaterThan(0.9);
            expect(metric.precision).toBeGreaterThan(0.9);
        }
    });
});
