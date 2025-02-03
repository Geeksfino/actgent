import { BenchmarkRunner } from './runner';
import { BenchmarkMetrics } from './types';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

interface LongMemEvalTurn {
    role: 'user' | 'assistant';
    content: string;
    has_answer?: boolean;
}

interface LongMemEvalSession {
    id: string;
    date: string;
    turns: LongMemEvalTurn[];
}

interface LongMemEvalInstance {
    question_id: string;
    question_type: 'single-session-user' | 'single-session-assistant' | 'single-session-preference' | 'temporal-reasoning' | 'knowledge-update' | 'multi-session';
    question: string;
    answer: string;
    question_date: string;
    haystack_session_ids: string[];
    haystack_dates: string[];
    haystack_sessions: LongMemEvalTurn[][];
    answer_session_ids: string[];
}

interface LongMemEvalMetrics extends BenchmarkMetrics {
    turnRecall: number;  // Recall at turn level
    sessionRecall: number;  // Recall at session level
    questionType: string;
}

export class LongMemEvalRunner {
    private runner: BenchmarkRunner;
    private dataset: LongMemEvalInstance[];

    constructor(datasetPath: string) {
        this.runner = new BenchmarkRunner();
        this.dataset = this.loadDataset(datasetPath);
    }

    private loadDataset(path: string): LongMemEvalInstance[] {
        const content = readFileSync(path, 'utf-8');
        const data = JSON.parse(content);
        // If data has an 'instances' field, return it; otherwise assume data is the array
        return data.instances ? data.instances : data;
    }

    private async runInstance(instance: LongMemEvalInstance): Promise<LongMemEvalMetrics> {
        const startTime = Date.now();

        // Convert LongMemEval format to our benchmark format
        const conversation = {
            id: instance.question_id,
            messages: instance.haystack_sessions.flatMap((session, sessionIndex) =>
                session.map((turn, turnIndex) => ({
                    id: `${instance.haystack_session_ids[sessionIndex]}_${turnIndex}`,
                    content: turn.content,
                    timestamp: new Date(instance.haystack_dates[sessionIndex]),
                    metadata: {
                        role: turn.role,
                        sessionId: instance.haystack_session_ids[sessionIndex],
                        hasAnswer: turn.has_answer || false,
                        entities: []  // We'll need entity extraction here
                    }
                }))
            ),
            queries: [{
                query: instance.question,
                expectedResults: instance.answer_session_ids.flatMap(sessionId => 
                    instance.haystack_sessions[instance.haystack_session_ids.indexOf(sessionId)]
                        .map((_, turnIndex) => `${sessionId}_${turnIndex}`)
                        .filter(id => instance.haystack_sessions
                            .flat()
                            .some((turn, i) => turn.has_answer && 
                                  `${instance.haystack_session_ids[Math.floor(i / instance.haystack_sessions[0].length)]}_${i % instance.haystack_sessions[0].length}` === id)
                        )
                ),
                metadata: {
                    temporal: {
                        validAt: new Date(instance.question_date)
                    }
                }
            }]
        };

        // Run the benchmark
        const results = await this.runner.runBenchmark(conversation);
        const metrics = results[0];

        // Calculate turn-level and session-level recall
        const retrievedTurnIds = new Set(metrics.retrievedIds || []);
        const expectedTurnIds = new Set(conversation.queries[0].expectedResults);
        const retrievedSessionIds = new Set(
            Array.from(retrievedTurnIds)
                .map(id => id.split('_')[0])
        );
        const expectedSessionIds = new Set(instance.answer_session_ids);

        return {
            ...metrics,
            turnRecall: expectedTurnIds.size > 0 ? 
                Array.from(expectedTurnIds)
                    .filter(id => retrievedTurnIds.has(id))
                    .length / expectedTurnIds.size : 0,
            sessionRecall: expectedSessionIds.size > 0 ?
                Array.from(expectedSessionIds)
                    .filter(id => retrievedSessionIds.has(id))
                    .length / expectedSessionIds.size : 0,
            questionType: instance.question_type
        };
    }

    public async runAll(): Promise<void> {
        const results: LongMemEvalMetrics[] = [];
        
        for (const instance of this.dataset) {
            const metrics = await this.runInstance(instance);
            results.push(metrics);
            
            // Log progress
            console.log(`Processed ${instance.question_id} (${instance.question_type}):`);
            console.log(`- Turn Recall: ${metrics.turnRecall.toFixed(3)}`);
            console.log(`- Session Recall: ${metrics.sessionRecall.toFixed(3)}`);
            console.log(`- Precision: ${metrics.precision.toFixed(3)}`);
            console.log(`- Latency: ${metrics.latencyMs}ms\n`);
        }

        // Calculate and log aggregate metrics
        const byType = new Map<string, LongMemEvalMetrics[]>();
        for (const result of results) {
            if (!byType.has(result.questionType)) {
                byType.set(result.questionType, []);
            }
            byType.get(result.questionType)!.push(result);
        }

        console.log('\nAggregate Results:');
        console.log('==================');
        
        for (const [type, typeResults] of byType.entries()) {
            const avgTurnRecall = typeResults.reduce((sum, r) => sum + r.turnRecall, 0) / typeResults.length;
            const avgSessionRecall = typeResults.reduce((sum, r) => sum + r.sessionRecall, 0) / typeResults.length;
            const avgPrecision = typeResults.reduce((sum, r) => sum + r.precision, 0) / typeResults.length;
            const avgLatency = typeResults.reduce((sum, r) => sum + r.latencyMs, 0) / typeResults.length;

            console.log(`\n${type}:`);
            console.log(`- Average Turn Recall: ${avgTurnRecall.toFixed(3)}`);
            console.log(`- Average Session Recall: ${avgSessionRecall.toFixed(3)}`);
            console.log(`- Average Precision: ${avgPrecision.toFixed(3)}`);
            console.log(`- Average Latency: ${avgLatency.toFixed(2)}ms`);
        }

        // Save detailed results
        const resultsPath = join(__dirname, 'longmemeval_results.json');
        const output = {
            timestamp: new Date().toISOString(),
            total_questions: results.length,
            results_by_type: Object.fromEntries(
                Array.from(byType.entries()).map(([type, typeResults]) => [
                    type,
                    {
                        count: typeResults.length,
                        avg_turn_recall: typeResults.reduce((sum, r) => sum + r.turnRecall, 0) / typeResults.length,
                        avg_session_recall: typeResults.reduce((sum, r) => sum + r.sessionRecall, 0) / typeResults.length,
                        avg_precision: typeResults.reduce((sum, r) => sum + r.precision, 0) / typeResults.length,
                        avg_latency: typeResults.reduce((sum, r) => sum + r.latencyMs, 0) / typeResults.length
                    }
                ])
            ),
            detailed_results: results
        };

        writeFileSync(resultsPath, JSON.stringify(output, null, 2));
        console.log(`\nDetailed results saved to: ${resultsPath}`);
    }
}
