import { 
    IGraphNode, 
    IGraphEdge, 
    GraphFilter, 
    TraversalOptions, 
    IGraphStorage,
    MemoryType
} from './types';
import { EpisodicGraphProcessor } from '../processing/episodic/processor';
import { TimeMode } from '../processing/temporal/temporal';
import { GraphTask } from '../types';
import { 
    PathResult,
    CommunityResult,
    SearchResult,
    TemporalResult
} from '../processing/episodic/types';

/**
 * Core memory graph implementation using LLM for complex operations
 */
export class MemoryGraph implements IGraphStorage {
    constructor(
        private storage: IGraphStorage,
        private llm: EpisodicGraphProcessor
    ) {}

    /**
     * Add a node to the graph
     */
    async addNode(node: IGraphNode): Promise<string> {
        node.createdAt = node.createdAt ?? new Date();
        node.validAt = node.validAt ?? node.createdAt;
        return this.storage.addNode(node);
    }

    /**
     * Get a node by id
     */
    async getNode(id: string): Promise<IGraphNode | null> {
        return this.storage.getNode(id);
    }

    /**
     * Update a node in the graph
     */
    async updateNode(id: string, updates: Partial<IGraphNode>): Promise<void> {
        const node = await this.storage.getNode(id);
        if (!node) {
            throw new Error(`Node ${id} not found`);
        }

        const updatedNode = { ...node, ...updates };
        updatedNode.createdAt = updatedNode.createdAt ?? node.createdAt;
        updatedNode.validAt = updatedNode.validAt ?? node.validAt;

        return this.storage.updateNode(id, updatedNode);
    }

    /**
     * Delete a node from the graph
     */
    async deleteNode(id: string): Promise<void> {
        return this.storage.deleteNode(id);
    }

    /**
     * Add an edge to the graph
     */
    async addEdge(edge: IGraphEdge): Promise<string> {
        return this.storage.addEdge(edge);
    }

    /**
     * Get an edge by id
     */
    async getEdge(id: string): Promise<IGraphEdge | null> {
        return this.storage.getEdge(id);
    }

    /**
     * Update an edge in the graph
     */
    async updateEdge(id: string, updates: Partial<IGraphEdge>): Promise<void> {
        return this.storage.updateEdge(id, updates);
    }

    /**
     * Delete an edge from the graph
     */
    async deleteEdge(id: string): Promise<void> {
        return this.storage.deleteEdge(id);
    }

    /**
     * Get nodes matching filter
     */
    async getNodes(filter: GraphFilter): Promise<IGraphNode[]> {
        const result = await this.storage.query(filter);
        return result.nodes;
    }

    /**
     * Get edges either by filter or by node IDs
     */
    async getEdges(param: GraphFilter | string[]): Promise<IGraphEdge[]> {
        if (Array.isArray(param)) {
            // Case: getEdges(nodeIds: string[])
            return this.storage.getEdges(param);
        } else {
            // Case: getEdges(filter: GraphFilter)
            const result = await this.storage.query({
                edgeTypes: param.edgeTypes,
                timeWindow: param.timeWindow,
                maxResults: param.maxResults,
                temporal: param.temporal,
                metadata: param.metadata
            });
            return result.edges;
        }
    }

    /**
     * Query the graph
     */
    async query(filter: GraphFilter & { sessionId?: string }): Promise<{nodes: IGraphNode[], edges: IGraphEdge[]}> {
        const result = await this.storage.query(filter);

        // Helper function to convert metadata Map to an object with sorted keys
        function sortedMetadata(metadata: Map<string, any>): string {
            return JSON.stringify(Object.fromEntries(Array.from(metadata.entries()).sort(([a],[b]) => a.localeCompare(b))));
        }

        // Node Deduplication
        result.nodes = Array.from(new Map(result.nodes.map(n => {
            const anyNode = n as any;
            let key: string;
            if (anyNode.episode !== undefined) {
                if (anyNode.episode && typeof anyNode.episode === 'object' && Array.isArray(anyNode.episode.entityIds)) {
                    const entityIds = [...anyNode.episode.entityIds].sort();
                    key = JSON.stringify({ entityIds });
                } else {
                    key = JSON.stringify(anyNode.episode);
                }
            } else if (n.metadata && n.metadata.has && n.metadata.has('episode')) {
                key = JSON.stringify(n.metadata.get('episode'));
            } else if (n.metadata) {
                key = JSON.stringify(Object.fromEntries(Array.from(n.metadata.entries()).sort(([a],[b]) => a.localeCompare(b))));
            } else {
                key = n.id;
            }
            return [key, n];
        })).values());

        return result;
    }

    /**
     * Traverse the graph
     */
    async traverse(startNodeId: string, options: TraversalOptions): Promise<{nodes: IGraphNode[], edges: IGraphEdge[]}> {
        return this.storage.traverse(startNodeId, options);
    }

    /**
     * Find paths between nodes
     */
    async findPaths(options: {
        startId: string;
        endId: string;
        maxLength?: number;
        edgeTypes?: string[];
        limit?: number;
    }): Promise<Array<{
        nodes: IGraphNode[];
        edges: IGraphEdge[];
        length: number;
    }>> {
        return this.storage.findPaths(options);
    }

    /**
     * Find connected nodes
     */
    async findConnectedNodes(options: {
        startId: string;
        edgeTypes?: string[];
        nodeTypes?: string[];
        direction?: 'incoming' | 'outgoing' | 'both';
        limit?: number;
    }): Promise<IGraphNode[]> {
        return this.storage.findConnectedNodes(options);
    }

    /**
     * Find paths between nodes using LLM
     */
    async findPathsWithLLM(sourceId: string, targetId: string, options?: TraversalOptions): Promise<PathResult[]> {
        const result = await this.llm.process<{paths: PathResult[]}>(GraphTask.FACT_EXTRACTION, {
            start: sourceId,
            end: targetId,
            options
        });

        return result.paths;
    }

    /**
     * Find and refine communities in the graph using LLM
     */
    async findCommunities(options?: {
        nodeTypes?: string[];
        minSize?: number;
        maxSize?: number;
    }): Promise<CommunityResult[]> {
        const result = await this.llm.process<{communities: CommunityResult[]}>(GraphTask.REFINE_COMMUNITIES, {
            options
        });

        return result.communities;
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
        const result = await this.llm.process<PathResult>(GraphTask.FACT_EXTRACTION, {
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
                confidence: 1.0,
                createdAt: new Date(),
                validAt: new Date()
            };
        }

        return {
            source: result.source,
            target: result.target,
            relationship: result.relationship,
            confidence: result.confidence,
            createdAt: result.createdAt ?? new Date(),
            validAt: result.validAt ?? (result.createdAt ?? new Date())
        };
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
            createdAt: r.createdAt ?? new Date(),
            validAt: r.validAt ?? (r.createdAt ?? new Date()),
            memoryType: MemoryType.SEMANTIC,
            content: r.relationship,
            episodeIds: []
        } as IGraphEdge));

        await Promise.all(edges.map((edge: IGraphEdge) => this.storage.addEdge(edge)));
    }
}
