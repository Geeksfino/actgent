import { IGraphNode, IGraphEdge, GraphFilter } from '../data/types';
import { MemoryGraph } from '../data/operations';
import { RankingFeatures, GraphFeatures } from './types';
import { GraphRankingOps } from './graph_ops';
import { RerankerConfig } from '../config/types';
import { DEFAULT_RERANKER_CONFIG } from '../config/defaults';

/**
 * Enhanced result reranking system with cross-encoder, MMR, and graph features
 */
export class ResultReranker {
    private config: RerankerConfig;
    private graphOps: GraphRankingOps;

    constructor(
        private graph: MemoryGraph,
        private llm: { generateText(prompt: string): Promise<string> },
        config: Partial<RerankerConfig> = {}
    ) {
        this.config = this.mergeConfig(DEFAULT_RERANKER_CONFIG, config);
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
        // Skip reranking if disabled
        if (!this.config.enabled) {
            return nodes.slice(0, this.config.maxResults);
        }

        // Calculate features for each node
        const withFeatures = await Promise.all(
            nodes.map(async ({ node, score, source }) => ({
                node,
                features: await this.calculateFeatures(node, score, query, { [source || 'text']: score })
            }))
        );

        // Apply reranking strategies based on config
        let reranked = withFeatures;

        // Apply RRF if configured
        if (this.config.rrf?.useRankFusion) {
            reranked = this.applyRRF(reranked);
        }

        // Apply MMR if configured
        if (this.config.mmr?.lambda !== undefined) {
            return this.applyMMR(reranked);
        }

        // Default to linear combination
        return this.combineScores(reranked)
            .slice(0, this.config.maxResults);
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
        if (!this.config.graphFeatures) {
            return undefined;
        }

        const centerNodeId = this.config.graphFeatures.centerNodeId;
        const maxPathLength = this.config.graphFeatures.maxPathLength ?? 3;
        const edgeTypes = this.config.graphFeatures.edgeTypes ?? [];

        return await this.graphOps.calculateGraphFeatures(
            node,
            centerNodeId,
            this.config.graphFeatures.queryNodeIds,
            maxPathLength,
            edgeTypes
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
        // Handle empty input
        if (!features || features.length === 0) {
            return [];
        }

        const maxResults = Math.min(this.config.maxResults ?? features.length, features.length);
        const lambda = this.config.mmr?.lambda ?? 0.5;
        const selected: IGraphNode[] = [];
        const candidates = [...features];
        const result: Array<{ node: IGraphNode; score: number }> = [];

        // Find highest scoring document
        const scores = candidates.map(c => c.features.relevanceScore);
        const maxScore = Math.max(...scores);
        const firstIndex = scores.findIndex(score => score === maxScore);

        // Safety check for invalid scores
        if (firstIndex === -1 || !candidates[firstIndex]) {
            // If we can't find a valid first document, just return all documents with their relevance scores
            return features.map(f => ({
                node: f.node,
                score: f.features.relevanceScore
            }));
        }

        // Add first document
        const [firstDoc] = candidates.splice(firstIndex, 1);
        selected.push(firstDoc.node);
        result.push({
            node: firstDoc.node,
            score: firstDoc.features.relevanceScore
        });

        // Then iteratively select documents maximizing MMR
        while (selected.length < maxResults && candidates.length > 0) {
            let bestScore = -Infinity;
            let bestIndex = -1;

            // Find the best candidate considering both relevance and diversity
            for (let i = 0; i < candidates.length; i++) {
                const candidate = candidates[i];
                if (!candidate?.node || !candidate?.features?.relevanceScore) continue;

                const relevanceScore = candidate.features.relevanceScore;
                
                // Calculate diversity score as 1 minus maximum similarity to selected docs
                const similarities = selected.map(node => 
                    this.calculateSimilarity(candidate.node, node)
                ).filter(score => !isNaN(score));

                const maxSimilarity = similarities.length > 0 ? Math.max(...similarities) : 0;
                const diversityScore = 1 - maxSimilarity;

                // MMR score combines relevance and diversity
                const mmrScore = lambda * relevanceScore + (1 - lambda) * diversityScore;

                if (mmrScore > bestScore) {
                    bestScore = mmrScore;
                    bestIndex = i;
                }
            }

            if (bestIndex === -1) break;

            // Add best candidate to results
            const [bestCandidate] = candidates.splice(bestIndex, 1);
            if (bestCandidate?.node) {
                selected.push(bestCandidate.node);
                result.push({
                    node: bestCandidate.node,
                    score: bestScore
                });
            }
        }

        return result;
    }

    /**
     * Apply RRF to rerank results
     */
    private applyRRF(features: Array<{ node: IGraphNode; features: RankingFeatures }>): Array<{ node: IGraphNode; features: RankingFeatures }> {
        const k = this.config.rrf?.k ?? 60;
        
        // Create rank maps for each feature
        const ranks = new Map<string, Map<string, number>>();
        const featureTypes = ['relevance', 'crossEncoder', 'temporal', 'connectivity', 'importance'] as const;
        
        // Calculate ranks for each feature
        for (const feature of featureTypes) {
            const featureRanks = new Map<string, number>();
            [...features]
                .sort((a, b) => {
                    const scoreA = feature === 'relevance' ? a.features.relevanceScore :
                        feature === 'crossEncoder' ? (a.features.crossEncoderScore ?? 0) :
                        feature === 'temporal' ? (a.features.recency ?? 0) :
                        feature === 'connectivity' ? (a.features.connectivity ?? 0) :
                        a.features.importance ?? 0;
                    
                    const scoreB = feature === 'relevance' ? b.features.relevanceScore :
                        feature === 'crossEncoder' ? (b.features.crossEncoderScore ?? 0) :
                        feature === 'temporal' ? (b.features.recency ?? 0) :
                        feature === 'connectivity' ? (b.features.connectivity ?? 0) :
                        b.features.importance ?? 0;
                    
                    return scoreB - scoreA;
                })
                .forEach(({ node }, index) => {
                    featureRanks.set(node.id, index + 1);
                });
            ranks.set(feature, featureRanks);
        }
        
        // Calculate RRF score for each node
        return features.map(item => {
            const rrf = featureTypes.reduce((sum, feature) => {
                const rank = ranks.get(feature)?.get(item.node.id) ?? features.length;
                return sum + 1 / (k + rank);
            }, 0);
            
            return {
                node: item.node,
                features: {
                    ...item.features,
                    rrf
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
            score: this.combineWithFeatures(features.rrf ?? features.relevanceScore, features)
        }));
    }

    /**
     * Calculate similarity between two nodes
     */
    private calculateSimilarity(node1: IGraphNode, node2: IGraphNode): number {
        if (!node1.embedding || !node2.embedding) {
            return 0;
        }

        const metric = this.config.mmr?.diversityMetric ?? 'cosine';

        // Convert embeddings to arrays if they're Float32Array
        const embedding1 = Array.from(node1.embedding);
        const embedding2 = Array.from(node2.embedding);

        if (metric === 'cosine') {
            // Cosine similarity between embeddings
            const dotProduct = embedding1.reduce((sum: number, val: number, i: number) => sum + val * embedding2[i], 0);
            const norm1 = Math.sqrt(embedding1.reduce((sum: number, val: number) => sum + val * val, 0));
            const norm2 = Math.sqrt(embedding2.reduce((sum: number, val: number) => sum + val * val, 0));
            
            return dotProduct / (norm1 * norm2);
        } else if (metric === 'euclidean') {
            // Euclidean distance (converted to similarity)
            const squaredDist = embedding1.reduce((sum: number, val: number, i: number) => {
                const diff = val - embedding2[i];
                return sum + diff * diff;
            }, 0);
            // Convert distance to similarity (1 when identical, approaching 0 as distance increases)
            return 1 / (1 + Math.sqrt(squaredDist));
        }

        return 0;
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
        const timestamp = node.metadata?.get('timestamp') as number;
        
        if (!timestamp) {
            return 0;
        }

        const age = (now.getTime() - timestamp) / (1000 * 60 * 60); // Age in hours
        return Math.exp(-decayRate * age);
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
        
        let score = rrf * 0.4; // RRF gets significant weight
        
        // Add weighted feature scores
        if (features.crossEncoderScore !== undefined && weights.crossEncoder) {
            score += features.crossEncoderScore * weights.crossEncoder;
        }
        
        if (features.recency !== undefined && weights.temporal) {
            score += features.recency * weights.temporal;
        }
        
        if (features.connectivity !== undefined && weights.connectivity) {
            score += features.connectivity * weights.connectivity;
        }
        
        if (features.importance !== undefined && weights.importance) {
            score += features.importance * weights.importance;
        }
        
        return score;
    }

    /**
     * Deep merge configurations
     */
    private mergeConfig(
        base: RerankerConfig,
        override: Partial<RerankerConfig>
    ): RerankerConfig {
        return {
            ...base,
            ...override,
            mmr: override.mmr ? { ...base.mmr, ...override.mmr } : base.mmr,
            rrf: override.rrf ? { ...base.rrf, ...override.rrf } : base.rrf,
            crossEncoder: override.crossEncoder ? { ...base.crossEncoder, ...override.crossEncoder } : base.crossEncoder,
            temporal: override.temporal ? { ...base.temporal, ...override.temporal } : base.temporal,
            graphFeatures: override.graphFeatures ? { ...base.graphFeatures, ...override.graphFeatures } : base.graphFeatures,
            weights: override.weights ? { ...base.weights, ...override.weights } : base.weights
        };
    }
}
