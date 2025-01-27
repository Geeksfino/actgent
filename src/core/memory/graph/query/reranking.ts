import { IGraphNode, IGraphEdge, GraphFilter } from '../data/types';
import { GraphOperations } from '../data/operations';

interface RankingFeatures {
    relevanceScore: number;     // Base relevance score from search
    recency: number;            // Time-based score
    connectivity: number;        // Graph connectivity score
    importance: number;         // Node importance score
}

interface RerankerConfig {
    relevanceWeight: number;    // Weight for base relevance score
    recencyWeight: number;      // Weight for time-based scoring
    connectivityWeight: number; // Weight for graph connectivity
    importanceWeight: number;   // Weight for node importance
    timeDecayFactor: number;    // Factor for time decay calculation
}

/**
 * Result reranking system that considers multiple factors
 */
export class ResultReranker {
    private defaultConfig: RerankerConfig = {
        relevanceWeight: 0.4,
        recencyWeight: 0.2,
        connectivityWeight: 0.2,
        importanceWeight: 0.2,
        timeDecayFactor: 0.1
    };

    constructor(
        private graphOps: GraphOperations,
        private config: Partial<RerankerConfig> = {}
    ) {
        this.config = { ...this.defaultConfig, ...config };
    }

    /**
     * Rerank search results considering multiple factors
     */
    async rerank(
        nodes: Array<{ node: IGraphNode; score: number }>,
        filter?: GraphFilter
    ): Promise<Array<{ node: IGraphNode; score: number }>> {
        const features = await Promise.all(
            nodes.map(async ({ node, score }) => ({
                node,
                features: await this.calculateFeatures(node, score)
            }))
        );

        // Calculate final scores
        const rankedResults = features.map(({ node, features }) => ({
            node,
            score: this.calculateFinalScore(features)
        }));

        // Sort by final score
        return rankedResults.sort((a, b) => b.score - a.score);
    }

    /**
     * Calculate ranking features for a node
     */
    private async calculateFeatures(
        node: IGraphNode,
        baseScore: number
    ): Promise<RankingFeatures> {
        const [connectivity, importance] = await Promise.all([
            this.calculateConnectivity(node),
            this.calculateImportance(node)
        ]);

        return {
            relevanceScore: baseScore,
            recency: this.calculateRecency(node),
            connectivity,
            importance
        };
    }

    /**
     * Calculate time-based recency score
     */
    private calculateRecency(node: IGraphNode): number {
        const now = new Date();
        const age = now.getTime() - node.createdAt.getTime();
        return Math.exp(-this.config.timeDecayFactor! * age / (1000 * 60 * 60 * 24)); // Decay per day
    }

    /**
     * Calculate node connectivity score
     */
    private async calculateConnectivity(node: IGraphNode): Promise<number> {
        const neighbors = await this.graphOps.getNeighbors(node.id);
        const edgeCount = neighbors.edges.length;
        
        // Normalize by log scale to handle high degree nodes
        return Math.log(edgeCount + 1) / Math.log(100); // Normalized to [0,1] assuming max 100 connections
    }

    /**
     * Calculate node importance using PageRank-inspired metric
     */
    private async calculateImportance(node: IGraphNode): Promise<number> {
        // Get all edges and filter for incoming edges to this node
        const allEdges = await this.graphOps.getEdges({});
        const incomingEdges = allEdges.filter(edge => edge.targetId === node.id);
        
        // Calculate weighted sum of incoming edge weights
        let importance = 0;
        incomingEdges.forEach(edge => {
            const weight = edge.weight || 1;
            importance += weight;
        });

        // Normalize by log scale
        return Math.log(importance + 1) / Math.log(100); // Normalized to [0,1]
    }

    /**
     * Calculate final score from features
     */
    private calculateFinalScore(features: RankingFeatures): number {
        const {
            relevanceWeight,
            recencyWeight,
            connectivityWeight,
            importanceWeight
        } = this.config;

        return (
            features.relevanceScore * relevanceWeight! +
            features.recency * recencyWeight! +
            features.connectivity * connectivityWeight! +
            features.importance * importanceWeight!
        );
    }
}
