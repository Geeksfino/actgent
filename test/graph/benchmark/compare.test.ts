import { describe, it, expect } from 'vitest';
import { IBenchmarkRunner } from './base';
import { BenchmarkRunner } from './runner';
import { GraphitiRunner } from './graphiti';
import { BenchmarkConversation } from './types';

describe('Memory Graph vs Graphiti Comparison', () => {
    const memoryGraph: IBenchmarkRunner = new BenchmarkRunner();
    const graphiti: IBenchmarkRunner = new GraphitiRunner();

    const testCases: { name: string; conversation: BenchmarkConversation }[] = [
        {
            name: 'Long-term Memory',
            conversation: {
                id: 'long_conversation_1',
                messages: Array.from({ length: 100 }, (_, i) => ({
                    id: `msg${i}`,
                    content: i === 0 ? 'My favorite color is blue' : 
                             i === 99 ? 'I still love the color blue' : 
                             `Random message ${i}`,
                    timestamp: new Date(Date.now() + i * 60000),
                    metadata: i === 0 || i === 99 ? {
                        type: 'preference',
                        entities: ['color_blue']
                    } : {}
                })),
                queries: [{
                    query: 'What is my favorite color?',
                    expectedResults: ['msg0', 'msg99'],
                    metadata: {
                        entities: ['color_blue']
                    }
                }]
            }
        },
        {
            name: 'Temporal Evolution',
            conversation: {
                id: 'temporal_evolution_1',
                messages: Array.from({ length: 10 }, (_, i) => ({
                    id: `msg${i}`,
                    content: `Status update ${i}`,
                    timestamp: new Date(Date.now() + i * 86400000),
                    metadata: {
                        type: 'status',
                        entities: [`status_${i}`]
                    }
                })),
                queries: Array.from({ length: 5 }, (_, i) => ({
                    query: `Status at day ${i}`,
                    expectedResults: [`msg${i}`],
                    metadata: {
                        temporal: {
                            validAt: new Date(Date.now() + i * 86400000)
                        },
                        entities: [`status_${i}`]
                    }
                }))
            }
        },
        {
            name: 'Semantic Search',
            conversation: {
                id: 'semantic_search_1',
                messages: Array.from({ length: 20 }, (_, i) => ({
                    id: `msg${i}`,
                    content: `Semantic content ${i}`,
                    embedding: Array.from({ length: 3 }, () => Math.random()),
                    timestamp: new Date(),
                    metadata: {
                        type: 'semantic',
                        entities: [`concept_${i}`]
                    }
                })),
                queries: [{
                    query: 'Find similar content',
                    embedding: [0.5, 0.5, 0.5],
                    expectedResults: ['msg0', 'msg1', 'msg2'],
                    metadata: {
                        entities: ['concept_0', 'concept_1', 'concept_2']
                    }
                }]
            }
        }
    ];

    for (const { name, conversation } of testCases) {
        it(`should compare ${name} performance`, async () => {
            const memoryResults = await memoryGraph.runBenchmark(conversation);
            const graphitiResults = await graphiti.runBenchmark(conversation);

            // Compare results
            for (let i = 0; i < memoryResults.length; i++) {
                const memoryMetrics = memoryResults[i];
                const graphitiMetrics = graphitiResults[i];

                console.log(`\n${name} - Query ${i + 1}:`);
                console.log('Memory Graph:', {
                    recall: memoryMetrics.recall.toFixed(3),
                    precision: memoryMetrics.precision.toFixed(3),
                    f1Score: memoryMetrics.f1Score.toFixed(3),
                    mrr: memoryMetrics.mrr.toFixed(3),
                    latencyMs: memoryMetrics.latencyMs
                });
                console.log('Graphiti:', {
                    recall: graphitiMetrics.recall.toFixed(3),
                    precision: graphitiMetrics.precision.toFixed(3),
                    f1Score: graphitiMetrics.f1Score.toFixed(3),
                    mrr: graphitiMetrics.mrr.toFixed(3),
                    latencyMs: graphitiMetrics.latencyMs
                });

                // Basic assertions to ensure both implementations work
                expect(memoryMetrics.recall).toBeGreaterThan(0);
                expect(graphitiMetrics.recall).toBeGreaterThan(0);
            }
        });
    }
});
