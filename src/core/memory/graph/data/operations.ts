import { 
    IGraphNode, 
    IGraphEdge, 
    GraphFilter, 
    TraversalOptions, 
    IGraphStorage,
    GraphMemoryType
} from './types';
import { GraphLLMProcessor } from '../processing/llm/processor';
import { TimeMode } from '../processing/temporal/temporal';
import { GraphTask } from '../types';
import { 
    PathResult,
    CommunityResult,
    SearchResult,
    TemporalResult
} from '../processing/llm/types';

/**
 * Core memory graph implementation using LLM for complex operations
 */
export class MemoryGraph {
    constructor(
        private storage: IGraphStorage,
        private llm: GraphLLMProcessor
    ) {}

    /**
     * Add a node to the graph
     */
    async addNode(node: IGraphNode): Promise<void> {
        await this.storage.addNode(node);
    }

    /**
     * Add an edge to the graph
     */
    async addEdge(edge: IGraphEdge): Promise<void> {
        await this.storage.addEdge(edge);
    }

    /**
     * Get nodes matching filter
     */
    async getNodes(filter: GraphFilter): Promise<IGraphNode[]> {
        const result = await this.storage.query(filter);
        return result.nodes;
    }

    /**
     * Get edges matching filter
     */
    async getEdges(filter: GraphFilter): Promise<IGraphEdge[]> {
        const result = await this.storage.query({
            edgeTypes: filter.edgeTypes,
            timeWindow: filter.timeWindow,
            maxResults: filter.maxResults,
            temporal: filter.temporal,
            metadata: filter.metadata
        });
        return result.edges;
    }

    /**
     * Find paths between nodes
     */
    async findPaths(sourceId: string, targetId: string, options?: TraversalOptions): Promise<PathResult[]> {
        const result = await this.storage.query({});
        const paths = await this.llm.process<PathResult[]>(
            GraphTask.EVALUATE_PATHS,
            {
                start: sourceId,
                end: targetId,
                nodes: result.nodes,
                edges: result.edges,
                options
            }
        );
        return paths;
    }

    /**
     * Get neighboring nodes and edges for a given node
     */
    async getNeighbors(nodeId: string): Promise<{ nodes: IGraphNode[], edges: IGraphEdge[] }> {
        const result = await this.storage.query({
            nodeIds: [nodeId],
            includeNeighbors: true
        });
        return {
            nodes: result.nodes.filter(n => n.id !== nodeId),
            edges: result.edges
        };
    }

    /**
     * Update a node in the graph
     */
    async updateNode(id: string, updates: Partial<IGraphNode>): Promise<void> {
        const node = await this.storage.getNode(id);
        if (!node) {
            throw new Error(`Node ${id} not found`);
        }
        await this.storage.updateNode(id, { ...node, ...updates });
    }

    /**
     * Find a path between two nodes using LLM
     */
    async findPath(sourceId: string, targetId: string): Promise<PathResult[]> {
        const source = await this.storage.getNode(sourceId);
        const target = await this.storage.getNode(targetId);
        if (!source || !target) {
            throw new Error('Source or target node not found');
        }

        // Get all possible paths through traversal
        const { nodes, edges } = await this.storage.traverse(sourceId, {
            maxDepth: 3,
            direction: 'outbound'
        });

        // Use LLM to analyze and explain the best path
        const result = await this.llm.process<PathResult>(GraphTask.EVALUATE_PATHS, {
            source,
            target,
            nodes,
            edges
        });

        // If no path found, return empty path
        if (!result) {
            return [{ path: [], explanation: 'No path found', score: 0 }];
        }

        return [result];
    }

    /**
     * Detect communities in the graph using LLM
     */
    async detectCommunities(): Promise<CommunityResult[]> {
        // Get all nodes and edges
        const { nodes, edges } = await this.storage.query({});
        
        // Use LLM to detect and analyze communities
        const result = await this.llm.process<CommunityResult[]>(GraphTask.REFINE_COMMUNITIES, { 
            nodes,
            edges
        });

        // Return empty array if no communities found
        if (!result) {
            return [];
        }

        return result;
    }

    /**
     * Analyze temporal changes for a node
     */
    async analyzeTemporalChanges(nodeId: string): Promise<TemporalResult> {
        const node = await this.storage.getNode(nodeId);
        if (!node) {
            throw new Error(`Node ${nodeId} not found`);
        }

        // Get temporal history through traversal
        const { nodes: historyNodes, edges: historyEdges } = await this.storage.traverse(nodeId, {
            maxDepth: 1,
            direction: 'outbound'
        });

        // Use LLM to analyze changes
        const result = await this.llm.process<TemporalResult>(
            GraphTask.EXTRACT_TEMPORAL,
            { 
                node,
                history: {
                    nodes: historyNodes,
                    edges: historyEdges
                }
            }
        );

        // Return default result if no analysis available
        if (!result) {
            return {
                source: nodeId,
                target: nodeId,
                relationship: 'NO_CHANGE',
                confidence: 1.0
            };
        }

        return result;
    }

    /**
     * Find communities
     */
    async findCommunities(nodeIds: string[]): Promise<CommunityResult[]> {
        // Implementation
        return [];
    }

    /**
     * Search
     */
    async search(query: string): Promise<SearchResult[]> {
        // Implementation
        return [];
    }

    /**
     * Update node temporal info
     */
    async updateNodeTemporalInfo(nodeId: string, timeMode: TimeMode): Promise<void> {
        const result = await this.llm.process<TemporalResult[]>(
            GraphTask.EXTRACT_TEMPORAL,
            { nodeId, timeMode }
        );

        const edges = result.map((r: TemporalResult) => ({
            id: `${r.source}_${r.target}_${r.relationship}`,
            sourceId: r.source,
            targetId: r.target,
            type: r.relationship,
            metadata: new Map([['confidence', r.confidence]]),
            createdAt: new Date(),
            memoryType: GraphMemoryType.SEMANTIC,
            content: r.relationship,
            episodeIds: []
        } as IGraphEdge));

        await Promise.all(edges.map(edge => this.storage.addEdge(edge)));
    }
}
