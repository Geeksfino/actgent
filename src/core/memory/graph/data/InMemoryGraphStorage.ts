import { IGraphStorage, IGraphNode, IGraphEdge, GraphFilter, GraphMemoryType, TraversalOptions, IGraphUnit, EpisodeContent, isEpisodeNode, EpisodeFilter } from './types';
import crypto from 'crypto';

/**
 * In-memory implementation of graph storage
 */
export class InMemoryGraphStorage implements IGraphStorage {
    private nodes: Map<string, IGraphNode>;
    private edges: Map<string, IGraphEdge>;
    private adjacencyList: Map<string, Set<string>>;

    constructor(maxCapacity: number = 1000) {
        this.nodes = new Map();
        this.edges = new Map();
        this.adjacencyList = new Map();
    }

    // Graph-specific operations
    async addNode(node: IGraphNode): Promise<string> {
        const id = node.id || crypto.randomUUID();
        node.id = id;
        
        // Validate temporal consistency
        this.validateTemporalConsistency(node);
        
        this.nodes.set(id, node);
        return id;
    }

    async getNode(id: string): Promise<IGraphNode | null> {
        return this.nodes.get(id) || null;
    }

    async updateNode(id: string, updates: Partial<IGraphNode>): Promise<void> {
        const node = await this.getNode(id);
        if (!node) throw new Error(`Node ${id} not found`);
        
        Object.assign(node, updates);
        
        // Validate temporal consistency
        this.validateTemporalConsistency(node);
        
        this.nodes.set(id, node);
    }

    async deleteNode(id: string): Promise<void> {
        // Remove from main storage
        this.nodes.delete(id);
        
        // Remove connected edges
        for (const [edgeId, edge] of this.edges) {
            if (edge.sourceId === id || edge.targetId === id) {
                await this.deleteEdge(edgeId);
            }
        }
        
        // Remove from adjacency list
        this.adjacencyList.delete(id);
    }

    async addEdge(edge: IGraphEdge): Promise<string> {
        const id = edge.id || crypto.randomUUID();
        edge.id = id;
        
        // Validate temporal consistency
        this.validateTemporalConsistency(edge);
        
        // Verify that source and target nodes exist
        if (!this.nodes.has(edge.sourceId) || !this.nodes.has(edge.targetId)) {
            throw new Error('Source or target node does not exist');
        }
        
        this.edges.set(id, edge);
        
        // Update adjacency list
        if (!this.adjacencyList.has(edge.sourceId)) {
            this.adjacencyList.set(edge.sourceId, new Set());
        }
        this.adjacencyList.get(edge.sourceId)!.add(edge.targetId);
        
        return id;
    }

    async getEdge(id: string): Promise<IGraphEdge | null> {
        return this.edges.get(id) || null;
    }

    async updateEdge(id: string, updates: Partial<IGraphEdge>): Promise<void> {
        const edge = await this.getEdge(id);
        if (!edge) throw new Error(`Edge ${id} not found`);
        
        Object.assign(edge, updates);
        
        // Validate temporal consistency
        this.validateTemporalConsistency(edge);
        
        this.edges.set(id, edge);
    }

    async deleteEdge(id: string): Promise<void> {
        const edge = this.edges.get(id);
        if (!edge) return;
        
        // Remove from main storage
        this.edges.delete(id);
        
        // Update adjacency list
        const sourceAdjList = this.adjacencyList.get(edge.sourceId);
        if (sourceAdjList) {
            sourceAdjList.delete(edge.targetId);
        }
    }

    async getNeighbors(nodeId: string): Promise<IGraphNode[]> {
        const neighbors = this.adjacencyList.get(nodeId);
        if (!neighbors) return [];

        const nodes: IGraphNode[] = [];
        for (const id of neighbors) {
            const node = this.nodes.get(id);
            if (node) nodes.push(node);
        }

        return nodes;
    }

    async getEdges(nodeIds: string[]): Promise<IGraphEdge[]> {
        const edges: IGraphEdge[] = [];
        const edgeSet = new Set<string>();

        // Collect all edges connected to the given nodes
        for (const nodeId of nodeIds) {
            const neighbors = this.adjacencyList.get(nodeId);
            if (!neighbors) continue;

            for (const neighborId of neighbors) {
                // Find edges between these nodes
                for (const [edgeId, edge] of this.edges) {
                    if ((edge.sourceId === nodeId && edge.targetId === neighborId) ||
                        (edge.sourceId === neighborId && edge.targetId === nodeId)) {
                        if (!edgeSet.has(edgeId)) {
                            edgeSet.add(edgeId);
                            edges.push(edge);
                        }
                    }
                }
            }
        }

        return edges;
    }

    async findPath(sourceId: string, targetId: string): Promise<IGraphEdge[]> {
        // Simple BFS to find shortest path
        const visited = new Set<string>();
        const queue: Array<{ id: string; path: IGraphEdge[] }> = [{ id: sourceId, path: [] }];
        
        while (queue.length > 0) {
            const { id, path } = queue.shift()!;
            if (id === targetId) return path;
            
            if (visited.has(id)) continue;
            visited.add(id);
            
            const neighbors = this.adjacencyList.get(id);
            if (!neighbors) continue;
            
            for (const neighborId of neighbors) {
                if (!visited.has(neighborId)) {
                    const edge = Array.from(this.edges.values()).find(e => 
                        (e.sourceId === id && e.targetId === neighborId) ||
                        (e.sourceId === neighborId && e.targetId === id)
                    );
                    if (edge) {
                        queue.push({ 
                            id: neighborId, 
                            path: [...path, edge]
                        });
                    }
                }
            }
        }
        
        return [];
    }

    async search(embedding: number[], limit: number = 10): Promise<IGraphNode[]> {
        // TODO: Implement vector similarity search if needed
        // For now, just return an empty array since we removed the embedding search dependency
        return [];
    }

    async findValidAt(date: Date): Promise<{nodes: IGraphNode[], edges: IGraphEdge[]}> {
        const nodes = Array.from(this.nodes.values()).filter(node => 
            node.createdAt <= date && (!node.expiredAt || node.expiredAt > date) &&
            (!node.validAt || node.validAt <= date)
        );
        
        const edges = Array.from(this.edges.values()).filter(edge =>
            edge.createdAt <= date && (!edge.expiredAt || edge.expiredAt > date) &&
            (!edge.validAt || edge.validAt <= date) &&
            (!edge.invalidAt || edge.invalidAt > date)
        );

        return { nodes, edges };
    }

    private applyTemporalFilter(item: IGraphUnit, temporal?: GraphFilter['temporal']): boolean {
        if (!temporal) {
            return true;
        }

        const { validAt, validAfter, validBefore } = temporal;

        // Check point-in-time validity
        if (validAt) {
            // Item must be valid at the given time
            if (!item.validAt || validAt < item.validAt) {
                return false;
            }

            // Item must not have expired
            if (item.expiredAt && validAt >= item.expiredAt) {
                return false;
            }

            // Check invalidAt only for edges
            const edge = item as IGraphEdge;
            if ('invalidAt' in edge && edge.invalidAt && validAt >= edge.invalidAt) {
                return false;
            }
        }

        // Check range validity
        if (validAfter || validBefore) {
            // Item must be valid at or before validBefore
            if (validBefore && item.validAt && item.validAt >= validBefore) {
                return false;
            }

            // Item must be valid at or after validAfter
            if (validAfter && item.validAt && item.validAt > validAfter) {
                return false;
            }

            // Item must not expire during the range
            if (item.expiredAt) {
                if (validAfter && item.expiredAt <= validAfter) {
                    return false;
                }
                if (validBefore && item.expiredAt <= validBefore) {
                    return false;
                }
            }

            // Check invalidAt only for edges
            const edge = item as IGraphEdge;
            if ('invalidAt' in edge && edge.invalidAt) {
                if (validAfter && edge.invalidAt <= validAfter) {
                    return false;
                }
                if (validBefore && edge.invalidAt <= validBefore) {
                    return false;
                }
            }
        }

        return true;
    }

    private applyEpisodeFilter(node: IGraphNode, filter?: EpisodeFilter): boolean {
        if (!filter || !isEpisodeNode(node)) {
            return true;  // No filter or not an episode node, include it
        }

        const episode = node as IGraphNode<EpisodeContent>;

        // Check source filter
        if (filter.source && episode.content.source !== filter.source) {
            return false;
        }

        // Check time range filter
        if (filter.timeRange) {
            if (!episode.validAt ||
                episode.validAt < filter.timeRange.start ||
                episode.validAt > filter.timeRange.end) {
                return false;
            }
        }

        // Check entity references
        if (filter.entityIds?.length) {
            const connectedEdges = Array.from(this.edges.values())
                .filter(edge => 
                    // Check both directions:
                    // 1. Episode -> Entity (episode is source)
                    // 2. Entity -> Episode (episode is target)
                    (edge.sourceId === episode.id && filter.entityIds!.includes(edge.targetId)) ||
                    (edge.targetId === episode.id && filter.entityIds!.includes(edge.sourceId))
                );
            return connectedEdges.length > 0;  // Only include if connected to at least one requested entity
        }

        return true;  // Include if all filters pass
    }

    async query(filter: GraphFilter & { sessionId?: string } = {}): Promise<{ nodes: IGraphNode[]; edges: IGraphEdge[] }> {
        let nodes = Array.from(this.nodes.values());
        let edges = Array.from(this.edges.values());

        console.log('Initial graph state:', {
            nodeCount: nodes.length,
            edgeCount: edges.length,
            nodeTypes: new Set(nodes.map(n => n.type)),
            edgeTypes: new Set(edges.map(e => e.type))
        });

        // Apply sessionId filter
        if (filter.sessionId) {
            console.log("query before sessionId filter nodes.length: ", nodes.length);
            nodes = nodes.filter(node => {
                if (isEpisodeNode(node)) {
                    return node.content.sessionId === filter.sessionId;
                } else {
                    return node.content.sessionId === filter.sessionId;
                }
                return true;
            });
            console.log("query after sessionId filter nodes.length: ", nodes.length);
        }

        // Apply existing filters
        if (filter.sessionId) {
            console.log("query before sessionId filter nodes.length: ", nodes.length);
            nodes = nodes.filter(node => {
                if (isEpisodeNode(node)) {
                    return node.content.sessionId === filter.sessionId;
                } else {
                    return node.content.sessionId === filter.sessionId;
                }
                return true;
            });
            console.log("query after sessionId filter nodes.length: ", nodes.length);
        }

        if (filter.nodeTypes?.length) {
            // console.log("query before nodeTypes filter nodes.length: ", nodes.length);
            nodes = nodes.filter(node => filter.nodeTypes!.includes(node.type));
            console.log("query after nodeTypes filter nodes.length: ", nodes.length);
        }

        if (filter.edgeTypes?.length) {
            console.log("query before edgeTypes filter edges.length: ", edges.length);
            edges = edges.filter(edge => filter.edgeTypes!.includes(edge.type));
            console.log("query after edgeTypes filter edges.length: ", edges.length);
        }

        if (filter.temporal) {
            console.log("query before temporal filter nodes.length: ", nodes.length);
            console.log("query before temporal filter edges.length: ", edges.length);
            nodes = nodes.filter(node => this.applyTemporalFilter(node, filter.temporal));
            edges = edges.filter(edge => this.applyTemporalFilter(edge, filter.temporal));
            console.log("query after temporal filter nodes.length: ", nodes.length);
            console.log("query after temporal filter edges.length: ", edges.length);
        }

        // Apply episode filter if present
        if (filter.episode) {
            console.log("query before episode filter nodes.length: ", nodes.length);
            console.log("query before episode filter edges.length: ", edges.length);
            // Only include episode nodes when using episode filters
            nodes = nodes.filter(node => isEpisodeNode(node) && this.applyEpisodeFilter(node, filter.episode));
            // Get edges connected to filtered nodes
            const nodeIds = new Set(nodes.map(n => n.id));
            edges = edges.filter(edge => 
                nodeIds.has(edge.sourceId) || nodeIds.has(edge.targetId)
            );
            console.log("query after episode filter nodes.length: ", nodes.length);
            console.log("query after episode filter edges.length: ", edges.length);
        }

        // Apply metadata filter
        if (filter.metadata) {
            console.log("query before metadata filter nodes.length: ", nodes.length);
            console.log("query before metadata filter edges.length: ", edges.length);
            nodes = nodes.filter(node => this.matchesMetadata(node.metadata, filter.metadata));
            edges = edges.filter(edge => this.matchesMetadata(edge.metadata, filter.metadata));
            console.log("query after metadata filter nodes.length: ", nodes.length);
            console.log("query after metadata filter edges.length: ", edges.length);
        }

        // Apply limit if specified
        if (typeof filter.limit === 'number' && filter.limit > 0) {
            console.log("query before limit filter nodes.length: ", nodes.length);
            console.log("query before limit filter edges.length: ", edges.length);
            nodes = nodes.slice(0, filter.limit);
            // Keep edges where at least one node is in the limited set
            const nodeIds = new Set(nodes.map(n => n.id));
            edges = edges.filter(edge => 
                nodeIds.has(edge.sourceId) || nodeIds.has(edge.targetId)
            );
            // Add any nodes connected to these edges that weren't in the original limit
            const connectedNodeIds = new Set<string>();
            edges.forEach(edge => {
                connectedNodeIds.add(edge.sourceId);
                connectedNodeIds.add(edge.targetId);
            });
            const additionalNodes = Array.from(connectedNodeIds)
                .filter(id => !nodeIds.has(id))
                .map(id => this.nodes.get(id))
                .filter((node): node is IGraphNode => node !== undefined);
            nodes = [...nodes, ...additionalNodes];
            console.log("query after limit filter nodes.length: ", nodes.length);
            console.log("query after limit filter edges.length: ", edges.length);
        }

        console.log('Final graph state:', {
            nodeCount: nodes.length,
            edgeCount: edges.length,
            nodeTypes: new Set(nodes.map(n => n.type)),
            edgeTypes: new Set(edges.map(e => e.type))
        });

        return { nodes, edges };
    }

    async traverse(startNodeId: string, options: TraversalOptions): Promise<{nodes: IGraphNode[], edges: IGraphEdge[]}> {
        const visited = new Set<string>();
        const nodes: IGraphNode[] = [];
        const edges: Set<IGraphEdge> = new Set(); // Use Set to prevent duplicate edges
        const queue: {nodeId: string; depth: number}[] = [{nodeId: startNodeId, depth: 0}];
        
        while (queue.length > 0) {
            const {nodeId, depth} = queue.shift()!;
            
            if (visited.has(nodeId) || (options.maxDepth !== undefined && depth > options.maxDepth)) {
                continue;
            }
            
            visited.add(nodeId);
            const node = await this.getNode(nodeId);
            if (node) nodes.push(node);
            
            // Get connected nodes based on direction
            const connectedNodes = new Set<string>();
            
            if (options.direction !== 'inbound') {
                // Outbound edges
                const outbound = this.adjacencyList.get(nodeId);
                if (outbound) {
                    for (const targetId of outbound) {
                        const edge = Array.from(this.edges.values()).find(e => 
                            e.sourceId === nodeId && e.targetId === targetId
                        );
                        if (edge) {
                            edges.add(edge);
                            connectedNodes.add(targetId);
                        }
                    }
                }
            }
            
            if (options.direction !== 'outbound') {
                // Inbound edges
                for (const [sourceId, targets] of this.adjacencyList.entries()) {
                    if (targets.has(nodeId)) {
                        const edge = Array.from(this.edges.values()).find(e => 
                            e.sourceId === sourceId && e.targetId === nodeId
                        );
                        if (edge) {
                            edges.add(edge);
                            connectedNodes.add(sourceId);
                        }
                    }
                }
            }
            
            // Add connected nodes to queue
            for (const nextId of connectedNodes) {
                if (!visited.has(nextId)) {
                    queue.push({nodeId: nextId, depth: depth + 1});
                }
            }
        }
        
        return { nodes, edges: Array.from(edges) };
    }

    async invalidateEdge(edgeId: string, at: Date): Promise<void> {
        const edge = await this.getEdge(edgeId);
        if (edge) {
            edge.expiredAt = at;
        }
    }

    async clear(): Promise<void> {
        this.nodes.clear();
        this.edges.clear();
        this.adjacencyList.clear();
    }

    async findNodes(filter: GraphFilter): Promise<IGraphNode[]> {
        const nodes = Array.from(this.nodes.values());
        return nodes.filter(node => {
            if (filter.nodeTypes && !filter.nodeTypes.includes(node.type)) {
                return false;
            }
            if (filter.temporal) {
                return this.applyTemporalFilter(node, filter.temporal);
            }
            return true;
        });
    }

    async findEdges(filter: GraphFilter): Promise<IGraphEdge[]> {
        const edges = Array.from(this.edges.values());
        return edges.filter(edge => {
            if (filter.edgeTypes && !filter.edgeTypes.includes(edge.type)) {
                return false;
            }
            if (filter.temporal) {
                return this.applyTemporalFilter(edge, filter.temporal);
            }
            return true;
        });
    }

    private validateTemporalConsistency(item: IGraphUnit): void {
        // Transaction time validation
        if (item.expiredAt && item.expiredAt <= item.createdAt) {
            throw new Error('expiredAt must be after createdAt');
        }
        
        // Valid time validation for edges
        if ('invalidAt' in item && item.invalidAt) {
            if (!item.validAt) {
                throw new Error('invalidAt requires validAt to be set');
            }
            if (item.validAt >= item.invalidAt) {
                throw new Error('validAt must be before invalidAt');
            }
        }

        // Episode-specific validation
        if (isEpisodeNode(item as IGraphNode)) {
            const episodeNode = item as IGraphNode<EpisodeContent>;

            if (!episodeNode.content?.timestamp) {
                throw new Error('Episode nodes must have a timestamp');
            }
            // Set validAt to match episode timestamp if not set
            if (!item.validAt) {
                item.validAt = episodeNode.content.timestamp;
            }
            // Ensure validAt matches episode timestamp
            else if (item.validAt.getTime() !== episodeNode.content.timestamp.getTime()) {
                throw new Error('Episode validAt must match content timestamp');
            }
        }
    }

    /**
     * Find paths between two nodes in the graph
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
        const {
            startId,
            endId,
            maxLength = 5,
            edgeTypes = ['*'],
            limit = 10
        } = options;

        // Use breadth-first search to find paths
        const queue: Array<{
            path: string[];
            edges: IGraphEdge[];
        }> = [{ path: [startId], edges: [] }];
        const paths: Array<{
            nodes: IGraphNode[];
            edges: IGraphEdge[];
            length: number;
        }> = [];
        const visited = new Set<string>();

        while (queue.length > 0 && paths.length < limit) {
            const { path, edges } = queue.shift()!;
            const currentId = path[path.length - 1];

            if (currentId === endId) {
                // Found a path to target
                const nodes = await Promise.all(path.map(id => this.getNode(id)));
                paths.push({
                    nodes: nodes.filter((n): n is IGraphNode => n !== null),
                    edges,
                    length: path.length - 1
                });
                continue;
            }

            if (path.length >= maxLength) continue;

            // Get outgoing edges
            const outEdges = Array.from(this.edges.values()).filter(edge => {
                if (edge.sourceId !== currentId) return false;
                if (edgeTypes[0] !== '*' && !edgeTypes.includes(edge.type)) return false;
                return true;
            });

            // Add next steps to queue
            for (const edge of outEdges) {
                const nextId = edge.targetId;
                if (path.includes(nextId)) continue; // Avoid cycles
                
                const pathKey = path.join(',') + ',' + nextId;
                if (visited.has(pathKey)) continue;
                
                visited.add(pathKey);
                queue.push({
                    path: [...path, nextId],
                    edges: [...edges, edge]
                });
            }
        }

        return paths;
    }

    /**
     * Get episodes within a time range, ordered by their occurrence time
     * @param startTime Start of time range
     * @param endTime End of time range
     * @returns Array of episode nodes sorted by validAt
     */
    async getEpisodeTimeline(startTime: Date, endTime: Date): Promise<IGraphNode<EpisodeContent>[]> {
        const nodes = Array.from(this.nodes.values())
            .filter(node => 
                isEpisodeNode(node) &&
                node.validAt &&
                node.validAt >= startTime &&
                node.validAt <= endTime &&
                (!node.expiredAt || node.expiredAt > new Date())  // Exclude expired nodes
            ) as IGraphNode<EpisodeContent>[];
        
        return nodes.sort((a, b) => a.validAt!.getTime() - b.validAt!.getTime());
    }

    /**
     * Find connected nodes based on edge and node types
     */
    async findConnectedNodes(options: {
        startId: string;
        edgeTypes?: string[];
        nodeTypes?: string[];
        direction?: 'incoming' | 'outgoing' | 'both';
        limit?: number;
    }): Promise<IGraphNode[]> {
        const {
            startId,
            edgeTypes = ['*'],
            nodeTypes = ['*'],
            direction = 'both',
            limit = 100
        } = options;

        const connectedNodes = new Set<string>();
        const edges = Array.from(this.edges.values());

        // Filter edges based on direction and types
        const relevantEdges = edges.filter(edge => {
            if (edgeTypes[0] !== '*' && !edgeTypes.includes(edge.type)) return false;

            if (direction === 'outgoing') {
                return edge.sourceId === startId;
            } else if (direction === 'incoming') {
                return edge.targetId === startId;
            } else {
                return edge.sourceId === startId || edge.targetId === startId;
            }
        });

        // Collect connected node IDs
        for (const edge of relevantEdges) {
            if (connectedNodes.size >= limit) break;
            
            const connectedId = edge.sourceId === startId ? edge.targetId : edge.sourceId;
            connectedNodes.add(connectedId);
        }

        // Get node objects and filter by type
        const nodes = await Promise.all(
            Array.from(connectedNodes).map(id => this.getNode(id))
        );

        return nodes
            .filter((n): n is IGraphNode => 
                n !== null && 
                (nodeTypes[0] === '*' || nodeTypes.includes(n.type))
            )
            .slice(0, limit);
    }

    /**
     * Check if metadata matches the filter criteria
     */
    private matchesMetadata(metadata: Map<string, any>, filter: Record<string, any> | undefined): boolean {
        if (!filter) return true;
        for (const [key, value] of Object.entries(filter)) {
            const metaValue = metadata.get(key);
            if (metaValue !== value) {
                return false;
            }
        }
        return true;
    }

    createNode(data: Partial<IGraphNode>): IGraphNode {
        const id = data.id || crypto.randomUUID();
        const timestamp = new Date();
        return {
            id,
            type: data.type || 'default',
            metadata: data.metadata || new Map(),
            createdAt: timestamp,
            expiredAt: data.expiredAt,
            validAt: data.validAt,
            content: data.content || {}
        };
    }

    createEdge(data: Partial<IGraphEdge>): IGraphEdge {
        const id = data.id || crypto.randomUUID();
        const timestamp = new Date();
        return {
            id,
            sourceId: data.sourceId || '',
            targetId: data.targetId || '',
            type: data.type || 'default',
            metadata: data.metadata || new Map(),
            createdAt: timestamp,
            expiredAt: data.expiredAt,
            validAt: data.validAt,
            invalidAt: data.invalidAt,
            content: data.content || {}
        };
    }

    private deepCloneWithMaps<T>(obj: T): T {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }

        if (obj instanceof Map) {
            return new Map(obj) as any;
        }

        if (obj instanceof Set) {
            return new Set(obj) as any;
        }

        if (Array.isArray(obj)) {
            return obj.map(item => this.deepCloneWithMaps(item)) as any;
        }

        const cloned: any = {};
        for (const [key, value] of Object.entries(obj)) {
            cloned[key] = this.deepCloneWithMaps(value);
        }
        return cloned;
    }
}
