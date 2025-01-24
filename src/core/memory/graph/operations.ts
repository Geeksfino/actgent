import { IGraphNode, IGraphEdge, GraphFilter, TraversalOptions, GraphResult } from './types';
import { IGraphStorage } from '../storage';

/**
 * Core graph operations implementation
 */
export class GraphOperations {
    constructor(private storage: IGraphStorage) {}

    /**
     * Find nodes connected to the given node
     */
    async getNeighbors(nodeId: string, options?: TraversalOptions): Promise<IGraphNode[]> {
        return this.storage.getNeighbors(nodeId);
    }

    /**
     * Find shortest path between two nodes
     */
    async findPath(sourceId: string, targetId: string): Promise<IGraphEdge[]> {
        return this.storage.findPath(sourceId, targetId);
    }

    /**
     * Get temporal context (n previous and next nodes in time)
     */
    async getTemporalContext(nodeId: string, contextSize: number = 4): Promise<IGraphNode[]> {
        const node = await this.storage.retrieve(nodeId) as IGraphNode;
        if (!node) return [];

        const filter: GraphFilter = {
            temporal: {
                from: new Date(node.temporal.eventTime.getTime() - (1000 * 60 * 60)), // 1 hour before
                to: new Date(node.temporal.eventTime.getTime() + (1000 * 60 * 60)),   // 1 hour after
                timelineType: 'event'
            }
        };

        return this.storage.findNodes(filter);
    }

    /**
     * Find nodes that share common neighbors with the given node
     */
    async findRelated(nodeId: string, maxDistance: number = 2): Promise<IGraphNode[]> {
        return this.storage.findNodes({
            maxDistance,
            metadata: new Map([['centerId', nodeId]])
        });
    }

    /**
     * Get all nodes and edges in a subgraph around a center node
     */
    async getSubgraph(centerId: string, options: TraversalOptions): Promise<GraphResult> {
        const nodes: IGraphNode[] = [];
        const edges: IGraphEdge[] = [];
        const visited = new Set<string>();
        const queue: Array<{ id: string; depth: number }> = [{ id: centerId, depth: 0 }];

        while (queue.length > 0) {
            const { id, depth } = queue.shift()!;
            if (visited.has(id) || (options.maxDepth !== undefined && depth > options.maxDepth)) {
                continue;
            }

            visited.add(id);
            const node = await this.storage.retrieve(id) as IGraphNode;
            if (node) {
                nodes.push(node);
                
                const neighbors = await this.getNeighbors(id, options);
                for (const neighbor of neighbors) {
                    queue.push({ id: neighbor.id, depth: depth + 1 });
                }
            }
        }

        return { nodes, edges };
    }
}
