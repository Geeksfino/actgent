import { BenchmarkRunner } from './runner';
import { BenchmarkConversation, BenchmarkMetrics } from './types';
import { writeFileSync } from 'fs';
import { join } from 'path';

interface AggregatedMetrics extends BenchmarkMetrics {
    testName: string;
    testType: string;
    iterations: number;
    stdDevRecall: number;
    stdDevPrecision: number;
    stdDevLatency: number;
}

class BenchmarkSuite {
    private runner: BenchmarkRunner;
    private results: AggregatedMetrics[] = [];

    constructor() {
        this.runner = new BenchmarkRunner();
    }

    private calculateStdDev(values: number[], mean: number): number {
        const squareDiffs = values.map(value => {
            const diff = value - mean;
            return diff * diff;
        });
        const avgSquareDiff = squareDiffs.reduce((sum, diff) => sum + diff, 0) / values.length;
        return Math.sqrt(avgSquareDiff);
    }

    private async runTest(name: string, type: string, conversation: BenchmarkConversation, iterations: number = 5): Promise<AggregatedMetrics> {
        const allMetrics: BenchmarkMetrics[][] = [];
        
        // Run multiple iterations
        for (let i = 0; i < iterations; i++) {
            const metrics = await this.runner.runBenchmark(conversation);
            allMetrics.push(metrics);
        }

        // Calculate averages and standard deviations
        const avgMetrics = allMetrics[0].map((_, queryIndex) => {
            const recallValues = allMetrics.map(metrics => metrics[queryIndex].recall);
            const precisionValues = allMetrics.map(metrics => metrics[queryIndex].precision);
            const latencyValues = allMetrics.map(metrics => metrics[queryIndex].latencyMs);

            const avgRecall = recallValues.reduce((a, b) => a + b, 0) / iterations;
            const avgPrecision = precisionValues.reduce((a, b) => a + b, 0) / iterations;
            const avgLatency = latencyValues.reduce((a, b) => a + b, 0) / iterations;

            return {
                testName: name,
                testType: type,
                iterations,
                recall: avgRecall,
                precision: avgPrecision,
                f1Score: 2 * (avgPrecision * avgRecall) / (avgPrecision + avgRecall),
                mrr: allMetrics.reduce((sum, metrics) => sum + metrics[queryIndex].mrr, 0) / iterations,
                latencyMs: avgLatency,
                stdDevRecall: this.calculateStdDev(recallValues, avgRecall),
                stdDevPrecision: this.calculateStdDev(precisionValues, avgPrecision),
                stdDevLatency: this.calculateStdDev(latencyValues, avgLatency)
            };
        });

        this.results.push(...avgMetrics);
        return avgMetrics[0];
    }

    public async runAll(): Promise<void> {
        // Long-term information retrieval test
        await this.runTest('Long-term Memory', 'retrieval', {
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
        });

        // Temporal evolution test
        await this.runTest('Temporal Evolution', 'temporal', {
            id: 'temporal_evolution_1',
            messages: Array.from({ length: 10 }, (_, i) => ({
                id: `msg${i}`,
                content: `Status update ${i}`,
                timestamp: new Date(Date.now() + i * 86400000), // One day apart
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
        });

        // Semantic search test
        await this.runTest('Semantic Search', 'semantic', {
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
        });

        // Save results
        this.saveResults();
    }

    private saveResults(): void {
        const resultsPath = join(__dirname, 'benchmark_results.json');
        const formattedResults = {
            timestamp: new Date().toISOString(),
            summary: {
                totalTests: this.results.length,
                averageRecall: this.results.reduce((sum, r) => sum + r.recall, 0) / this.results.length,
                averagePrecision: this.results.reduce((sum, r) => sum + r.precision, 0) / this.results.length,
                averageLatency: this.results.reduce((sum, r) => sum + r.latencyMs, 0) / this.results.length
            },
            results: this.results
        };

        writeFileSync(resultsPath, JSON.stringify(formattedResults, null, 2));
        console.log('Benchmark results:');
        console.log('==================');
        console.log(`Total tests: ${formattedResults.summary.totalTests}`);
        console.log(`Average recall: ${formattedResults.summary.averageRecall.toFixed(3)}`);
        console.log(`Average precision: ${formattedResults.summary.averagePrecision.toFixed(3)}`);
        console.log(`Average latency: ${formattedResults.summary.averageLatency.toFixed(2)}ms`);
        console.log('\nDetailed results saved to:', resultsPath);
    }
}

// Run the benchmarks
const suite = new BenchmarkSuite();
suite.runAll().catch(console.error);
