import { IGraphNode, IGraphEdge, GraphFilter } from '../data/types';
import { MemoryGraph } from '../data/operations';
import { RerankerConfig, RankingFeatures, GraphFeatures } from './types';
import { GraphRankingOps } from './graph_ops';

const DEFAULT_CONFIG: Required<RerankerConfig> = {
    maxResults: 10,
    minScore: 0.1,
    model: 'gpt-4',
    weights: {
        relevance: 0.4,
        crossEncoder: 0.3,
        diversity: 0.1,
        temporal: 0.1,
        connectivity: 0.15,
        importance: 0.15,
        graph: {
            distance: 0.1,
            mentions: 0.1,
            paths: 0.1
        }
    },
    crossEncoder: {
        model: 'gpt-4',
        batchSize: 10,
        scoreThreshold: 0.5,
        maxTokens: 100,
        temperature: 0.7
    },
    mmr: {
        diversityWeight: 0.3,
        lambda: 0.5
    },
    temporal: {
        decayRate: 0.1
    },
    rrf: {
        k: 60,                // constant to control ranking influence
        useRankFusion: true,  // whether to use RRF instead of linear combination
        useAsPreranker: false // whether to use RRF as pre-ranker
    },
    graph: {
        centerNodeId: undefined,
        queryNodeIds: [],
        maxPathLength: 3,
        edgeTypes: []
    }
};

/**
 * Enhanced result reranking system with cross-encoder, MMR, and graph features
 */
export class ResultReranker {
    private config: Required<RerankerConfig>;
    private graphOps: GraphRankingOps;

    constructor(
        private graph: MemoryGraph,
        private llm: { generateText(prompt: string): Promise<string> },
        config: Partial<RerankerConfig> = {}
    ) {
        this.config = this.mergeConfig(DEFAULT_CONFIG, config);
        this.graphOps = new GraphRankingOps(graph);
    }

    /**
     * Rerank search results considering multiple factors
     */
    async rerank(
        query: string,
        nodes: Array<{ node: IGraphNode; score: number; source?: 'embedding' | 'text' | 'llm' | 'graph' }>,
        filter?: GraphFilter
    ): Promise<Array<{ node: IGraphNode; score: number }>> {
        // Group nodes by source and calculate ranks
        const nodesBySource = nodes.reduce((acc, { node, score, source }) => {
            if (source) {
                if (!acc[source]) acc[source] = [];
                acc[source].push({ node, score });
            }
            return acc;
        }, {} as Record<string, Array<{ node: IGraphNode; score: number }>>);

        // Calculate ranks for each source
        const ranks = new Map<string, Map<string, number>>();
        for (const [source, sourceNodes] of Object.entries(nodesBySource)) {
            const sourceRanks = new Map<string, number>();
            sourceNodes
                .sort((a, b) => b.score - a.score)
                .forEach(({ node }, index) => {
                    sourceRanks.set(node.id, index + 1);
                });
            ranks.set(source, sourceRanks);
        }

        // Calculate features for all nodes
        const features = await Promise.all(
            nodes.map(async ({ node, score, source }) => ({
                node,
                features: await this.calculateFeatures(node, score, query, {
                    embedding: source === 'embedding' ? ranks.get('embedding')?.get(node.id) : undefined,
                    text: source === 'text' ? ranks.get('text')?.get(node.id) : undefined,
                    llm: source === 'llm' ? ranks.get('llm')?.get(node.id) : undefined,
                    graph: source === 'graph' ? ranks.get('graph')?.get(node.id) : undefined
                })
            }))
        );

        // Apply RRF as pre-ranker if configured
        let rankedFeatures = features;
        if (this.config.rrf?.useAsPreranker) {
            rankedFeatures = this.applyRRF(features);
        }

        // Apply MMR if diversity weight is set
        if (this.config.weights?.diversity && this.config.weights.diversity > 0) {
            return this.applyMMR(rankedFeatures);
        }

        // Use RRF or linear combination based on config
        return this.config.rrf?.useRankFusion && !this.config.rrf?.useAsPreranker ? 
            this.combineScores(this.applyRRF(rankedFeatures)) : 
            this.combineScores(rankedFeatures);
    }

    /**
     * Calculate all ranking features for a node
     */
    private async calculateFeatures(
        node: IGraphNode,
        baseScore: number,
        query: string,
        ranks: { embedding?: number; text?: number; llm?: number; graph?: number } = {}
    ): Promise<RankingFeatures> {
        const [crossEncoderScore, connectivity, importance, graphFeatures] = await Promise.all([
            this.calculateCrossEncoderScore(query, node),
            this.calculateConnectivity(node),
            this.calculateImportance(node),
            this.calculateGraphFeatures(node)
        ]);

        return {
            relevanceScore: baseScore,
            crossEncoderScore,
            recency: this.calculateRecency(node),
            connectivity,
            importance,
            graph: graphFeatures,
            ranks
        };
    }

    /**
     * Calculate graph-specific features
     */
    private async calculateGraphFeatures(node: IGraphNode): Promise<GraphFeatures | undefined> {
        const { graph: graphConfig } = this.config;
        if (!graphConfig?.centerNodeId && !graphConfig?.queryNodeIds?.length) {
            return undefined;
        }

        return await this.graphOps.calculateGraphFeatures(
            node,
            graphConfig.centerNodeId,
            graphConfig.queryNodeIds,
            graphConfig.maxPathLength,
            graphConfig.edgeTypes
        );
    }

    /**
     * Calculate cross-encoder score using LLM
     */
    private async calculateCrossEncoderScore(
        query: string,
        node: IGraphNode
    ): Promise<number> {
        if (!this.config.weights?.crossEncoder) return 0;

        const prompt = `Compare the relevance between the query and the text.
Query: ${query}
Text: ${node.content}

Rate the relevance on a scale from 0 to 1, where:
0 = completely irrelevant
1 = perfectly relevant

Return only the numeric score.`;

        const response = await this.llm.generateText(prompt);
        return parseFloat(response);
    }

    /**
     * Apply MMR for diversity
     */
    private applyMMR(features: Array<{ node: IGraphNode; features: RankingFeatures }>): Array<{ node: IGraphNode; score: number }> {
        const lambda = this.config.mmr?.lambda ?? 0.5;
        const selected: Array<{ node: IGraphNode; score: number }> = [];
        const candidates = [...features];

        while (selected.length < this.config.maxResults && candidates.length > 0) {
            let bestScore = -Infinity;
            let bestIndex = -1;

            // Find the best candidate
            for (let i = 0; i < candidates.length; i++) {
                const candidate = candidates[i];
                const relevance = candidate.features.relevanceScore;
                
                // Calculate diversity penalty
                let diversityPenalty = 0;
                if (selected.length > 0) {
                    const similarities = selected.map(s => 
                        this.calculateSimilarity(candidate.node, s.node)
                    );
                    diversityPenalty = Math.max(...similarities);
                }

                const score = lambda * relevance - (1 - lambda) * diversityPenalty;
                if (score > bestScore) {
                    bestScore = score;
                    bestIndex = i;
                }
            }

            if (bestIndex === -1) break;

            const best = candidates.splice(bestIndex, 1)[0];
            selected.push({ node: best.node, score: bestScore });
        }

        return selected;
    }

    /**
     * Apply RRF to rerank results
     */
    private applyRRF(features: Array<{ node: IGraphNode; features: RankingFeatures }>): Array<{ node: IGraphNode; features: RankingFeatures }> {
        const k = this.config.rrf?.k ?? 60;
        
        return features.map(({ node, features }) => {
            let rrf = 0;
            let count = 0;

            // Calculate RRF score
            const ranks = features.ranks;
            if (ranks.embedding !== undefined) {
                rrf += 1 / (k + ranks.embedding);
                count++;
            }
            if (ranks.text !== undefined) {
                rrf += 1 / (k + ranks.text);
                count++;
            }
            if (ranks.llm !== undefined) {
                rrf += 1 / (k + ranks.llm);
                count++;
            }
            if (ranks.graph !== undefined) {
                rrf += 1 / (k + ranks.graph);
                count++;
            }

            // Normalize by number of rankings
            if (count > 0) {
                rrf /= count;
            }

            // Return with updated features
            return {
                node,
                features: {
                    ...features,
                    relevanceScore: rrf
                }
            };
        });
    }

    /**
     * Combine scores using linear combination
     */
    private combineScores(features: Array<{ node: IGraphNode; features: RankingFeatures }>): Array<{ node: IGraphNode; score: number }> {
        return features.map(({ node, features }) => ({
            node,
            score: this.combineWithFeatures(features.relevanceScore, features)
        }));
    }

    /**
     * Calculate similarity between two nodes
     */
    private calculateSimilarity(node1: IGraphNode, node2: IGraphNode): number {
        if (!node1.embedding || !node2.embedding) {
            return 0;
        }

        // Cosine similarity between embeddings
        const dotProduct = node1.embedding.reduce((sum, val, i) => sum + val * node2.embedding![i], 0);
        const norm1 = Math.sqrt(node1.embedding.reduce((sum, val) => sum + val * val, 0));
        const norm2 = Math.sqrt(node2.embedding.reduce((sum, val) => sum + val * val, 0));
        
        return dotProduct / (norm1 * norm2);
    }

    /**
     * Calculate maximum similarity between a node and a list of nodes
     */
    private calculateMaxSimilarity(node: IGraphNode, nodes: IGraphNode[]): number {
        if (nodes.length === 0) return 0;
        return Math.max(...nodes.map(n => this.calculateSimilarity(node, n)));
    }

    /**
     * Calculate recency score based on temporal distance
     */
    private calculateRecency(node: IGraphNode): number {
        const decayRate = this.config.temporal?.decayRate ?? 0.1;
        const now = new Date();
        const timestamp = node.metadata?.get('timestamp');
        const nodeDate = timestamp ? new Date(timestamp) : now;
        const timeDiff = Math.abs(now.getTime() - nodeDate.getTime());
        return Math.exp(-decayRate * timeDiff / (1000 * 60 * 60 * 24)); // Decay per day
    }

    /**
     * Calculate node connectivity score
     */
    private async calculateConnectivity(node: IGraphNode): Promise<number> {
        const edges = await this.graph.getEdges({ nodeIds: [node.id] });
        return Math.min(1, edges.length / 10); // Normalize by assuming 10 connections is max
    }

    /**
     * Calculate node importance score
     */
    private async calculateImportance(node: IGraphNode): Promise<number> {
        // Could be enhanced with PageRank or other graph metrics
        const incomingEdges = await this.graph.getEdges({
            nodeIds: [node.id]
        });
        return Math.min(1, incomingEdges.length / 5); // Normalize
    }

    /**
     * Combine feature scores using configured weights
     */
    private combineWithFeatures(rrf: number, features: RankingFeatures): number {
        const weights = this.config.weights || {};
        const graphWeights = weights.graph || {};
        
        let score = rrf * 0.4 + // RRF gets significant weight
            (features.crossEncoderScore || 0) * (weights.crossEncoder ?? 0.3) +
            features.recency * (weights.temporal ?? 0.1) +
            features.connectivity * (weights.connectivity ?? 0.15) +
            features.importance * (weights.importance ?? 0.15);

        // Add graph feature scores if available
        if (features.graph) {
            const { distance, episodeMentions, paths } = features.graph;
            
            // Distance score (inverse of distance)
            if (distance !== Infinity) {
                score += (1 / (1 + distance)) * (graphWeights.distance ?? 0.1);
            }

            // Episode mentions score
            score += (episodeMentions / 10) * (graphWeights.mentions ?? 0.1); // Normalize by assuming 10 is a lot

            // Path score (consider path length and diversity)
            if (paths.length > 0) {
                const pathScore = paths.reduce((sum, path) => 
                    sum + (1 / path.length) * (path.types.length / path.length), 0) / paths.length;
                score += pathScore * (graphWeights.paths ?? 0.1);
            }
        }

        return score;
    }

    /**
     * Deep merge configurations
     */
    private mergeConfig(
        base: Required<RerankerConfig>,
        override: Partial<RerankerConfig>
    ): Required<RerankerConfig> {
        return {
            ...base,
            ...override,
            weights: { ...base.weights, ...override.weights },
            crossEncoder: { ...base.crossEncoder, ...override.crossEncoder },
            mmr: { ...base.mmr, ...override.mmr },
            temporal: { ...base.temporal, ...override.temporal },
            rrf: { ...base.rrf, ...override.rrf },
            graph: { ...base.graph, ...override.graph }
        };
    }
}
