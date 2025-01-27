import { IGraphNode, IGraphStorage, IGraphEdge } from '../data/types';
import { GraphFeatures } from './types';

/**
 * Graph operations for reranking
 */
export class GraphRankingOps {
    constructor(private storage: IGraphStorage) {}

    /**
     * Calculate graph features for a node
     */
    async calculateGraphFeatures(
        node: IGraphNode,
        centerNodeId?: string,
        queryNodeIds: string[] = [],
        maxPathLength: number = 3,
        edgeTypes: string[] = []
    ): Promise<GraphFeatures> {
        const [distance, mentions, paths] = await Promise.all([
            centerNodeId ? this.calculateDistance(node.id, centerNodeId) : Promise.resolve(Infinity),
            this.countEpisodeMentions(node.id),
            this.findPaths(node.id, queryNodeIds, maxPathLength, edgeTypes)
        ]);

        return {
            distance,
            episodeMentions: mentions,
            paths
        };
    }

    /**
     * Calculate shortest path distance between two nodes
     */
    private async calculateDistance(nodeId: string, targetId: string): Promise<number> {
        const paths = await this.storage.findPaths({
            startId: nodeId,
            endId: targetId,
            maxLength: 5, // Reasonable limit for distance calculation
            edgeTypes: ['*'], // Consider all edge types
            limit: 1 // Only need shortest path
        });

        return paths.length > 0 ? paths[0].length : Infinity;
    }

    /**
     * Count number of episode mentions for a node
     */
    private async countEpisodeMentions(nodeId: string): Promise<number> {
        const episodes = await this.storage.findConnectedNodes({
            startId: nodeId,
            edgeTypes: ['MENTIONS'],
            nodeTypes: ['Episode'],
            direction: 'incoming'
        });

        return episodes.length;
    }

    /**
     * Find paths between node and query nodes
     */
    private async findPaths(
        nodeId: string,
        queryNodeIds: string[],
        maxLength: number,
        edgeTypes: string[]
    ): Promise<Array<{ length: number; types: string[]; nodes: string[] }>> {
        if (queryNodeIds.length === 0) return [];

        const allPaths = await Promise.all(
            queryNodeIds.map(targetId =>
                this.storage.findPaths({
                    startId: nodeId,
                    endId: targetId,
                    maxLength,
                    edgeTypes: edgeTypes.length > 0 ? edgeTypes : ['*'],
                    limit: 3 // Get a few paths per target
                })
            )
        );

        return allPaths.flat().map(path => ({
            length: path.length,
            types: path.edges.map((e: IGraphEdge) => e.type),
            nodes: path.nodes.map((n: IGraphNode) => n.id)
        }));
    }
}
