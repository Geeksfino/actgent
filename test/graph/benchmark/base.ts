import { BenchmarkConversation, BenchmarkMetrics } from './types';

export interface IBenchmarkRunner {
    runBenchmark(conversation: BenchmarkConversation): Promise<BenchmarkMetrics[]>;
}
