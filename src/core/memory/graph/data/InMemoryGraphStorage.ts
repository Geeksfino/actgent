import { IGraphStorage, IGraphNode, IGraphEdge, GraphFilter, GraphMemoryType, TraversalOptions } from './types';
import crypto from 'crypto';

/**
 * In-memory implementation of graph storage
 */
export class InMemoryGraphStorage implements IGraphStorage {
    private nodes: Map<string, IGraphNode>;
    private edges: Map<string, IGraphEdge>;
    private adjacencyList: Map<string, Set<string>>;
    
    // Temporal indices for efficient querying
    private nodeTemporalIndex: {
        byCreatedAt: Map<string, Date>;
        byExpiredAt: Map<string, Date>;
        byValidAt: Map<string, Date>;
    };
    
    private edgeTemporalIndex: {
        byCreatedAt: Map<string, Date>;
        byExpiredAt: Map<string, Date>;
        byValidAt: Map<string, Date>;
        byInvalidAt: Map<string, Date>;
    };

    constructor(maxCapacity: number = 1000) {
        this.nodes = new Map();
        this.edges = new Map();
        this.adjacencyList = new Map();
        
        // Initialize temporal indices
        this.nodeTemporalIndex = {
            byCreatedAt: new Map(),
            byExpiredAt: new Map(),
            byValidAt: new Map()
        };
        
        this.edgeTemporalIndex = {
            byCreatedAt: new Map(),
            byExpiredAt: new Map(),
            byValidAt: new Map(),
            byInvalidAt: new Map()
        };
    }

    // Graph-specific operations
    async addNode(node: IGraphNode): Promise<string> {
        const id = node.id || crypto.randomUUID();
        node.id = id;
        this.nodes.set(id, node);
        this.nodeTemporalIndex.byCreatedAt.set(id, node.createdAt);
        if (node.expiredAt) this.nodeTemporalIndex.byExpiredAt.set(id, node.expiredAt);
        if (node.validAt) this.nodeTemporalIndex.byValidAt.set(id, node.validAt);
        return id;
    }

    async getNode(id: string): Promise<IGraphNode | null> {
        return this.nodes.get(id) || null;
    }

    async updateNode(id: string, updates: Partial<IGraphNode>): Promise<void> {
        const node = await this.getNode(id);
        if (!node) throw new Error(`Node ${id} not found`);
        
        Object.assign(node, updates);
        this.nodes.set(id, node);
        
        // Update temporal indices
        if (updates.expiredAt) this.nodeTemporalIndex.byExpiredAt.set(id, updates.expiredAt);
        if (updates.validAt) this.nodeTemporalIndex.byValidAt.set(id, updates.validAt);
    }

    async deleteNode(id: string): Promise<void> {
        // Remove from main storage
        this.nodes.delete(id);
        
        // Remove from temporal indices
        this.nodeTemporalIndex.byCreatedAt.delete(id);
        this.nodeTemporalIndex.byExpiredAt.delete(id);
        this.nodeTemporalIndex.byValidAt.delete(id);
        
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
        
        // Update temporal indices
        this.edgeTemporalIndex.byCreatedAt.set(id, edge.createdAt);
        if (edge.expiredAt) this.edgeTemporalIndex.byExpiredAt.set(id, edge.expiredAt);
        if (edge.validAt) this.edgeTemporalIndex.byValidAt.set(id, edge.validAt);
        if (edge.invalidAt) this.edgeTemporalIndex.byInvalidAt.set(id, edge.invalidAt);
        
        return id;
    }

    async getEdge(id: string): Promise<IGraphEdge | null> {
        return this.edges.get(id) || null;
    }

    async updateEdge(id: string, updates: Partial<IGraphEdge>): Promise<void> {
        const edge = await this.getEdge(id);
        if (!edge) throw new Error(`Edge ${id} not found`);
        
        Object.assign(edge, updates);
        this.edges.set(id, edge);
        
        // Update temporal indices
        if (updates.expiredAt) this.edgeTemporalIndex.byExpiredAt.set(id, updates.expiredAt);
        if (updates.validAt) this.edgeTemporalIndex.byValidAt.set(id, updates.validAt);
        if (updates.invalidAt) this.edgeTemporalIndex.byInvalidAt.set(id, updates.invalidAt);
    }

    async deleteEdge(id: string): Promise<void> {
        const edge = this.edges.get(id);
        if (!edge) return;
        
        // Remove from main storage
        this.edges.delete(id);
        
        // Remove from temporal indices
        this.edgeTemporalIndex.byCreatedAt.delete(id);
        this.edgeTemporalIndex.byExpiredAt.delete(id);
        this.edgeTemporalIndex.byValidAt.delete(id);
        this.edgeTemporalIndex.byInvalidAt.delete(id);
        
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

    async query(filter: GraphFilter): Promise<{nodes: IGraphNode[], edges: IGraphEdge[]}> {
        const nodes: IGraphNode[] = [];
        const edges: IGraphEdge[] = [];
        
        // Filter nodes
        for (const node of this.nodes.values()) {
            let include = true;
            
            // Type filter
            if (filter.nodeTypes && !filter.nodeTypes.includes(node.type)) {
                include = false;
            }
            
            // Time window filter
            if (include && filter.timeWindow) {
                if (node.createdAt > filter.timeWindow.end || 
                    (node.expiredAt && node.expiredAt <= filter.timeWindow.start)) {
                    include = false;
                }
            }
            
            // Temporal filter
            if (include && filter.temporal) {
                include = this.applyTemporalFilter(node, filter.temporal);
            }
            
            if (include) {
                nodes.push(node);
            }
        }
        
        // Filter edges
        for (const edge of this.edges.values()) {
            let include = true;
            
            // Type filter
            if (filter.edgeTypes && !filter.edgeTypes.includes(edge.type)) {
                include = false;
            }
            
            // Time window filter
            if (include && filter.timeWindow) {
                if (edge.createdAt > filter.timeWindow.end || 
                    (edge.expiredAt && edge.expiredAt <= filter.timeWindow.start)) {
                    include = false;
                }
            }
            
            // Temporal filter
            if (include && filter.temporal) {
                include = this.applyTemporalFilter(edge, filter.temporal);
            }
            
            if (include) {
                edges.push(edge);
            }
        }
        
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
            this.edgeTemporalIndex.byExpiredAt.set(edgeId, at);
        }
    }

    async clear(): Promise<void> {
        this.nodes.clear();
        this.edges.clear();
        this.adjacencyList.clear();
        
        // Clear temporal indices
        this.nodeTemporalIndex.byCreatedAt.clear();
        this.nodeTemporalIndex.byExpiredAt.clear();
        this.nodeTemporalIndex.byValidAt.clear();
        
        this.edgeTemporalIndex.byCreatedAt.clear();
        this.edgeTemporalIndex.byExpiredAt.clear();
        this.edgeTemporalIndex.byValidAt.clear();
        this.edgeTemporalIndex.byInvalidAt.clear();
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

    private removeNodeFromTemporalIndices(nodeId: string): void {
        this.nodeTemporalIndex.byCreatedAt.delete(nodeId);
        this.nodeTemporalIndex.byExpiredAt.delete(nodeId);
        this.nodeTemporalIndex.byValidAt.delete(nodeId);
    }

    private removeEdgeFromTemporalIndices(edgeId: string): void {
        this.edgeTemporalIndex.byCreatedAt.delete(edgeId);
        this.edgeTemporalIndex.byExpiredAt.delete(edgeId);
        this.edgeTemporalIndex.byValidAt.delete(edgeId);
        this.edgeTemporalIndex.byInvalidAt.delete(edgeId);
    }

    async updateNodeTemporalIndices(node: IGraphNode) {
        this.nodeTemporalIndex.byCreatedAt.set(node.id, node.createdAt);
        if (node.expiredAt) {
            this.nodeTemporalIndex.byExpiredAt.set(node.id, node.expiredAt);
        }
        if (node.validAt) {
            this.nodeTemporalIndex.byValidAt.set(node.id, node.validAt);
        }
    }

    async updateEdgeTemporalIndices(edge: IGraphEdge) {
        this.edgeTemporalIndex.byCreatedAt.set(edge.id, edge.createdAt);
        if (edge.expiredAt) {
            this.edgeTemporalIndex.byExpiredAt.set(edge.id, edge.expiredAt);
        }
        if (edge.validAt) {
            this.edgeTemporalIndex.byValidAt.set(edge.id, edge.validAt);
        }
        if (edge.invalidAt) {
            this.edgeTemporalIndex.byInvalidAt.set(edge.id, edge.invalidAt);
        }
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
            weight: data.weight,
            memoryType: GraphMemoryType.SEMANTIC,
            content: data.content || {},
            episodeIds: data.episodeIds || []
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

    private applyTemporalFilter(item: IGraphNode | IGraphEdge, temporal?: GraphFilter['temporal']): boolean {
        if (!temporal) return true;

        const {
            createdAfter, createdBefore,
            expiredAfter, expiredBefore,
            validAfter, validBefore,
            invalidAfter, invalidBefore,
            validAt
        } = temporal;

        // Handle point-in-time validity check first
        if (validAt) {
            // Item must exist at validAt
            if (item.createdAt >= validAt) return false;

            // Item must not be expired at validAt
            if (item.expiredAt && item.expiredAt <= validAt) return false;

            // For edges, check invalidation time
            if ('invalidAt' in item && item.invalidAt && item.invalidAt <= validAt) return false;

            // Check validAt - item must be valid at or before the query time
            if (item.validAt && item.validAt > validAt) return false;

            return true;
        }

        // Handle time range checks if not using validAt
        if (createdAfter && item.createdAt <= createdAfter) return false;
        if (createdBefore && item.createdAt >= createdBefore) return false;

        if (expiredAfter && item.expiredAt && item.expiredAt <= expiredAfter) return false;
        if (expiredBefore && item.expiredAt && item.expiredAt >= expiredBefore) return false;

        if (validAfter && item.validAt && item.validAt <= validAfter) return false;
        if (validBefore && item.validAt && item.validAt >= validBefore) return false;

        if ('invalidAt' in item) {
            if (invalidAfter && item.invalidAt && item.invalidAt <= invalidAfter) return false;
            if (invalidBefore && item.invalidAt && item.invalidAt >= invalidBefore) return false;
        }

        return true;
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
}
