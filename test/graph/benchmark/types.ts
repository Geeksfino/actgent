import { IGraphNode, IGraphEdge } from '../../../src/core/memory/graph/data/types';

export interface BenchmarkQuery {
    query: string;
    embedding?: number[];
    expectedResults: string[];  // IDs of expected nodes
    metadata?: Record<string, any>;
}

export interface BenchmarkConversation {
    id: string;
    messages: BenchmarkMessage[];
    queries: BenchmarkQuery[];
}

export interface BenchmarkMessage {
    id: string;
    content: string;
    embedding?: number[];
    timestamp: Date;
    metadata?: Record<string, any>;
}

export interface BenchmarkMetrics {
    recall: number;
    precision: number;
    f1Score: number;
    mrr: number;
    latencyMs: number;
    retrievedIds?: string[];  // IDs of retrieved nodes
}
