import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResultReranker } from '../../src/core/memory/graph/query/reranking';
import { MemoryGraph } from '../../src/core/memory/graph/data/operations';
import { IGraphNode } from '../../src/core/memory/graph/data/types';
import { DEFAULT_RERANKER_CONFIG } from '../../src/core/memory/graph/config/defaults';

// Mock dependencies
const mockGraphRankingOps = {
    calculateGraphFeatures: vi.fn().mockResolvedValue({
        distance: 1,
        episodeMentions: 0,
        paths: []
    }),
    calculateConnectivity: vi.fn().mockResolvedValue(0.5),
    calculateImportance: vi.fn().mockResolvedValue(0.5)
};

describe('ResultReranker', () => {
    let mockGraph: MemoryGraph;
    let mockLLM: { generateText: (prompt: string) => Promise<string> };
    let reranker: ResultReranker;
    let mockNodes: Array<{ node: IGraphNode; score: number }>;

    beforeEach(() => {
        // Mock dependencies
        mockGraph = {
            getNode: vi.fn(),
            getEdges: vi.fn().mockResolvedValue([]),
            getNeighbors: vi.fn().mockResolvedValue([]),
            findConnectedNodes: vi.fn().mockResolvedValue([])
        } as unknown as MemoryGraph;

        mockLLM = {
            generateText: vi.fn().mockResolvedValue('Mock response')
        };

        // Create test nodes
        const now = Date.now();
        mockNodes = [
            {
                node: {
                    id: '1',
                    type: 'test',
                    content: 'Test node 1',
                    embedding: new Float32Array([0.1, 0.2, 0.3]),
                    metadata: new Map([['timestamp', now]]),
                    createdAt: new Date(now)
                },
                score: 0.9
            },
            {
                node: {
                    id: '2',
                    type: 'test',
                    content: 'Test node 2',
                    embedding: new Float32Array([0.2, 0.3, 0.4]),
                    metadata: new Map([['timestamp', now - 1000 * 60 * 60]]), // 1 hour ago
                    createdAt: new Date(now - 1000 * 60 * 60)
                },
                score: 0.8
            }
        ];

        // Reset all mocks
        vi.clearAllMocks();

        // Create reranker instance with mocked GraphRankingOps
        reranker = new ResultReranker(mockGraph, mockLLM);
        (reranker as any).graphOps = mockGraphRankingOps;
    });

    describe('Basic Reranking', () => {
        it('should return original results when disabled', async () => {
            const disabledReranker = new ResultReranker(mockGraph, mockLLM, {
                enabled: false
            });
            (disabledReranker as any).graphOps = mockGraphRankingOps;

            const results = await disabledReranker.rerank('test query', mockNodes);
            expect(results).toHaveLength(mockNodes.length);
            expect(results[0].score).toBe(mockNodes[0].score);
        });

        it('should respect maxResults configuration', async () => {
            const limitedReranker = new ResultReranker(mockGraph, mockLLM, {
                enabled: true,
                maxResults: 1
            });
            (limitedReranker as any).graphOps = mockGraphRankingOps;

            const results = await limitedReranker.rerank('test query', mockNodes);
            expect(results).toHaveLength(1);
        });
    });

    describe('MMR Reranking', () => {
        it('should apply MMR when configured', async () => {
            const mmrReranker = new ResultReranker(mockGraph, mockLLM, {
                enabled: true,
                mmr: {
                    lambda: 0.7,
                    diversityMetric: 'cosine'
                }
            });
            (mmrReranker as any).graphOps = mockGraphRankingOps;

            const results = await mmrReranker.rerank('test query', mockNodes);
            expect(results).toHaveLength(mockNodes.length);
            // First result should be the highest scoring one
            expect(results[0].node.id).toBe(mockNodes[0].node.id);
        });

        it('should balance relevance and diversity', async () => {
            // Create nodes with similar content but different scores
            const similarNodes = [
                {
                    node: {
                        id: '1',
                        type: 'test',
                        content: 'Machine learning',
                        embedding: new Float32Array([0.8, 0.1, 0.1]),
                        metadata: new Map([['timestamp', Date.now()]]),
                        createdAt: new Date()
                    },
                    score: 0.9
                },
                {
                    node: {
                        id: '2',
                        type: 'test',
                        content: 'Machine learning basics',
                        embedding: new Float32Array([0.79, 0.11, 0.1]),
                        metadata: new Map([['timestamp', Date.now() - 1000 * 60]]), // 1 minute ago
                        createdAt: new Date(Date.now() - 1000 * 60)
                    },
                    score: 0.85
                },
                {
                    node: {
                        id: '3',
                        type: 'test',
                        content: 'Deep learning',
                        embedding: new Float32Array([0.1, 0.8, 0.1]),
                        metadata: new Map([['timestamp', Date.now() - 1000 * 60 * 5]]), // 5 minutes ago
                        createdAt: new Date(Date.now() - 1000 * 60 * 5)
                    },
                    score: 0.7
                }
            ];

            const mmrReranker = new ResultReranker(mockGraph, mockLLM, {
                enabled: true,
                mmr: {
                    lambda: 0.3, // Lower lambda to prioritize diversity
                    diversityMetric: 'cosine'
                }
            });
            (mmrReranker as any).graphOps = mockGraphRankingOps;

            const results = await mmrReranker.rerank('test query', similarNodes);
            
            // The second result should be the more diverse one (id: 3)
            // rather than the more similar one (id: 2)
            expect(results[1].node.id).toBe('3');
        });
    });

    describe('RRF Reranking', () => {
        it('should apply RRF when configured', async () => {
            const rrfReranker = new ResultReranker(mockGraph, mockLLM, {
                enabled: true,
                rrf: {
                    k: 60,
                    useRankFusion: true
                }
            });
            (rrfReranker as any).graphOps = mockGraphRankingOps;

            const results = await rrfReranker.rerank('test query', mockNodes);
            expect(results).toHaveLength(mockNodes.length);
        });

        it('should combine multiple ranking signals', async () => {
            // Mock nodes with different strengths in different features
            const mixedNodes = [
                {
                    node: {
                        id: '1',
                        type: 'test',
                        content: 'High relevance, low recency',
                        embedding: new Float32Array([0.1, 0.1, 0.1]),
                        metadata: new Map([['timestamp', Date.now() - 1000 * 60 * 60 * 24]]), // 24 hours ago
                        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24)
                    },
                    score: 0.9
                },
                {
                    node: {
                        id: '2',
                        type: 'test',
                        content: 'Medium relevance, high recency',
                        embedding: new Float32Array([0.2, 0.2, 0.2]),
                        metadata: new Map([['timestamp', Date.now()]]),
                        createdAt: new Date()
                    },
                    score: 0.7
                }
            ];

            const rrfReranker = new ResultReranker(mockGraph, mockLLM, {
                enabled: true,
                rrf: {
                    k: 60,
                    useRankFusion: true
                },
                weights: {
                    relevance: 0.5,
                    temporal: 0.5
                }
            });
            (rrfReranker as any).graphOps = mockGraphRankingOps;

            const results = await rrfReranker.rerank('test query', mixedNodes);
            expect(results).toHaveLength(mixedNodes.length);
            
            // Scores should be influenced by both relevance and recency
            const score1 = results.find(r => r.node.id === '1')?.score;
            const score2 = results.find(r => r.node.id === '2')?.score;
            expect(score1).toBeDefined();
            expect(score2).toBeDefined();
            expect(Math.abs(score1! - score2!)).toBeLessThan(0.5); // Scores should be closer due to different strengths
        });
    });

    describe('Feature Combination', () => {
        it('should combine features according to weights', async () => {
            const weightedReranker = new ResultReranker(mockGraph, mockLLM, {
                enabled: true,
                weights: {
                    relevance: 0.8,
                    temporal: 0.2
                }
            });
            (weightedReranker as any).graphOps = mockGraphRankingOps;

            const results = await weightedReranker.rerank('test query', mockNodes);
            expect(results).toHaveLength(mockNodes.length);
            
            // First node should still be first due to high relevance weight
            expect(results[0].node.id).toBe(mockNodes[0].node.id);
        });
    });
});
