import { IGraphNode, IGraphEdge, GraphFilter } from '../data/types';
import { MemoryGraph } from '../data/operations';
import { RerankerConfig, RerankResult } from './types';

interface RankingFeatures {
    relevanceScore: number;     // Base relevance score from search
    crossEncoderScore?: number; // Score from cross-encoder
    diversityScore?: number;    // MMR diversity score
    recency: number;            // Time-based score
    connectivity: number;       // Graph connectivity score
    importance: number;         // Node importance score
}

const DEFAULT_CONFIG: Required<RerankerConfig> = {
    maxResults: 10,
    minScore: 0.1,
    model: 'gpt-4',
    weights: {
        relevance: 0.2,
        crossEncoder: 0.3,
        diversity: 0.1,
        temporal: 0.1,
        connectivity: 0.15,
        importance: 0.15
    },
    crossEncoder: {
        model: 'gpt-4',
        batchSize: 10,
        scoreThreshold: 0.5,
        maxTokens: 1000,
        temperature: 0.0
    },
    mmr: {
        diversityWeight: 0.3,
        lambda: 0.5
    },
    temporal: {
        decayRate: 0.1
    }
};

/**
 * Enhanced result reranking system with cross-encoder and MMR
 */
export class ResultReranker {
    private config: Required<RerankerConfig>;

    constructor(
        private graphOps: MemoryGraph,
        private llm: { generateText(prompt: string): Promise<string> },
        config: Partial<RerankerConfig> = {}
    ) {
        this.config = this.mergeConfig(DEFAULT_CONFIG, config);
    }

    /**
     * Rerank search results considering multiple factors
     */
    async rerank(
        query: string,
        nodes: Array<{ node: IGraphNode; score: number }>,
        filter?: GraphFilter
    ): Promise<Array<{ node: IGraphNode; score: number }>> {
        const features = await Promise.all(
            nodes.map(async ({ node, score }) => ({
                node,
                features: await this.calculateFeatures(node, score, query)
            }))
        );

        // Apply MMR if diversity weight is set
        if (this.config.weights?.diversity && this.config.weights.diversity > 0) {
            return this.applyMMR(features);
        }

        // Otherwise, combine scores normally
        return this.combineScores(features);
    }

    /**
     * Calculate all ranking features for a node
     */
    private async calculateFeatures(
        node: IGraphNode,
        baseScore: number,
        query: string
    ): Promise<RankingFeatures> {
        const [crossEncoderScore, connectivity, importance] = await Promise.all([
            this.calculateCrossEncoderScore(query, node),
            this.calculateConnectivity(node),
            this.calculateImportance(node)
        ]);

        return {
            relevanceScore: baseScore,
            crossEncoderScore,
            recency: this.calculateRecency(node),
            connectivity,
            importance
        };
    }

    /**
     * Calculate cross-encoder score using LLM
     */
    private async calculateCrossEncoderScore(
        query: string,
        node: IGraphNode
    ): Promise<number> {
        if (!this.config.weights.crossEncoder) return 0;

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
     * Apply Maximal Marginal Relevance reranking
     */
    private applyMMR(
        features: Array<{ node: IGraphNode; features: RankingFeatures }>
    ): Array<{ node: IGraphNode; score: number }> {
        const selected: typeof features = [];
        const candidates = [...features];
        const { lambda } = this.config.mmr;

        while (selected.length < this.config.maxResults && candidates.length > 0) {
            let bestScore = -Infinity;
            let bestIndex = -1;

            for (let i = 0; i < candidates.length; i++) {
                const candidate = candidates[i];
                const relevance = this.calculateCombinedScore(candidate.features);
                
                const diversity = selected.length === 0 ? 1 :
                    Math.min(...selected.map(s => {
                        if (!candidate.node.embedding || !s.node.embedding) {
                            return 1; // Maximum diversity if embeddings not available
                        }
                        return 1 - this.calculateSimilarity(
                            candidate.node.embedding,
                            s.node.embedding
                        );
                    }));

                const score = lambda * relevance + (1 - lambda) * diversity;

                if (score > bestScore) {
                    bestScore = score;
                    bestIndex = i;
                }
            }

            if (bestIndex === -1) break;

            const selected_item = candidates[bestIndex];
            selected.push(selected_item);
            candidates.splice(bestIndex, 1);
        }

        return selected.map(item => ({
            node: item.node,
            score: this.calculateCombinedScore(item.features)
        }));
    }

    /**
     * Calculate similarity between two embeddings
     */
    private calculateSimilarity(a: number[], b: number[]): number {
        const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
        const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
        const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
        return dotProduct / (magnitudeA * magnitudeB);
    }

    /**
     * Calculate recency score
     */
    private calculateRecency(node: IGraphNode): number {
        const now = this.config.temporal.referenceTime ?? new Date();
        const age = now.getTime() - node.createdAt.getTime();
        const days = age / (1000 * 60 * 60 * 24);
        return Math.exp(-this.config.temporal.decayRate * days);
    }

    /**
     * Calculate node connectivity score
     */
    private async calculateConnectivity(node: IGraphNode): Promise<number> {
        const edges = await this.graphOps.getEdges({ nodeIds: [node.id] });
        return Math.min(1, edges.length / 10); // Normalize by assuming 10 connections is max
    }

    /**
     * Calculate node importance score
     */
    private async calculateImportance(node: IGraphNode): Promise<number> {
        // Could be enhanced with PageRank or other graph metrics
        const incomingEdges = await this.graphOps.getEdges({
            nodeIds: [node.id]
        });
        return Math.min(1, incomingEdges.length / 5); // Normalize
    }

    /**
     * Combine feature scores using configured weights
     */
    private combineScores(
        features: Array<{ node: IGraphNode; features: RankingFeatures }>
    ): Array<{ node: IGraphNode; score: number }> {
        return features
            .map(({ node, features }) => ({
                node,
                score: this.calculateCombinedScore(features)
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, this.config.maxResults)
            .filter(({ score }) => score >= this.config.minScore);
    }

    /**
     * Combine all feature scores using configured weights
     */
    private calculateCombinedScore(features: RankingFeatures): number {
        const weights = this.config.weights;
        let totalWeight = 0;
        let weightedScore = 0;

        for (const [key, weight] of Object.entries(weights)) {
            if (weight > 0) {
                const score = features[key as keyof RankingFeatures] ?? 0;
                weightedScore += score * weight;
                totalWeight += weight;
            }
        }

        return weightedScore / totalWeight;
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
            temporal: { ...base.temporal, ...override.temporal }
        };
    }
}
