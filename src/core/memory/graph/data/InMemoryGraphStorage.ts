import { IGraphStorage, IGraphNode, IGraphEdge, GraphFilter, MemoryType, TraversalOptions, IGraphUnit, EpisodeContent, isEpisodeNode, EpisodeFilter } from './types';
import crypto from 'crypto';
import { IdGenerator } from '../id/IdGenerator';

/**
 * In-memory implementation of graph storage
 */
export class InMemoryGraphStorage implements IGraphStorage {
    private nodes: Map<string, IGraphNode>;
    private idGenerator: IdGenerator;

    constructor(idGenerator: IdGenerator, maxCapacity: number = 1000) {
        this.idGenerator = idGenerator;
        this.nodes = new Map();
    }

    // Graph-specific operations
    async addNode(node: IGraphNode): Promise<string> {
        const id = node.id || this.idGenerator.generateNodeId({ type: node.type, content: node.content });
        node.id = id;
        
        node.edges = [];
        console.log('Adding node to storage:', {
            id,
            type: node.type,
            content: node.content,
            metadata: Object.fromEntries(node.metadata || new Map()),
            existingNodes: Array.from(this.nodes.keys())
        });
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
        
        this.nodes.set(id, node);
    }

    async deleteNode(id: string): Promise<void> {
        // Remove from main storage
        this.nodes.delete(id);
    }

    async addEdge(edge: IGraphEdge): Promise<string> {
        const id = edge.id || this.idGenerator.generateEdgeId({
            sourceId: edge.sourceId,
            targetId: edge.targetId,
            type: edge.type,
            content: edge.content
        });
        edge.id = id;

        // Ensure both nodes exist
        const sourceNode = await this.getNode(edge.sourceId);
        if (!sourceNode) {
            throw new Error(`Source node ${edge.sourceId} not found`);
        }

        const targetNode = await this.getNode(edge.targetId);
        if (!targetNode) {
            throw new Error(`Target node ${edge.targetId} not found`);
        }

        // Add edge to source node's edges array
        sourceNode.edges.push(edge);
        this.nodes.set(sourceNode.id, sourceNode);

        return id;
    }

    async getEdge(id: string): Promise<IGraphEdge | null> {
        return null;
    }

    async updateEdge(id: string, updates: Partial<IGraphEdge>): Promise<void> {
        throw new Error('Method not implemented.');
    }

    async deleteEdge(id: string): Promise<void> {
        // No-op
    }

    async getNeighbors(nodeId: string): Promise<IGraphNode[]> {
        return [];
    }

    async getEdges(nodeIds: string[]): Promise<IGraphEdge[]> {
        return [];
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
            
            // No neighbors to visit
            continue;
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
        
        return { nodes, edges: [] };
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
            return true;
        }

        const episode = node as IGraphNode<EpisodeContent>;

        // Check metadata source filter
        if (filter.source && episode.content.metadata?.source !== filter.source) {
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
            // No edges to check
            return false;
        }

        return true;  // Include if all filters pass
    }

    async query(filter: GraphFilter & { sessionId?: string } = {}): Promise<{
        nodes: IGraphNode[];
        edges: IGraphEdge[];
        episodes?: IGraphNode<EpisodeContent>[];
    }> {
        console.log('Query filter:', filter);
        // Filter out episode nodes - only store entity nodes in graph storage
        let nodes = Array.from(this.nodes.values()).filter(node => node.type !== 'episode');
        console.log('Initial nodes count:', nodes.length);

        // Apply type filter
        if (filter.nodeTypes?.length) {
            nodes = nodes.filter(node => filter.nodeTypes!.includes(node.type));
            console.log('After type filter:', nodes.length);
        }

        // Apply temporal filter
        if (filter.temporal) {
            nodes = nodes.filter(node => this.applyTemporalFilter(node, filter.temporal));
            console.log('After temporal filter:', nodes.length);
        }

        // Apply metadata filter
        if (filter.metadata) {
            nodes = nodes.filter(node => this.matchesMetadata(node.metadata, filter.metadata));
            console.log('After metadata filter:', nodes.length);
        }

        // Get edges for these nodes
        const edges = await this.getEdges(nodes.map(n => n.id));

        // Log the nodes for debugging
        console.log('nodes in graph:', nodes.map(n => ({
            id: n.id,
            type: n.type,
            content: n.content,
            validAt: n.validAt,
            createdAt: n.createdAt,
            metadata: Object.fromEntries(n.metadata || new Map())
        })));

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
            
            // No neighbors to visit
            continue;
        }
        
        return { nodes, edges: Array.from(edges) };
    }

    async invalidateEdge(edgeId: string, at: Date): Promise<void> {
        // No-op
    }

    async clear(): Promise<void> {
        this.nodes.clear();
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
        return [];
    }

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
        return [];
    }

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

    async getSnapshot(date: Date = new Date()): Promise<{
        nodeCount: number;
        nodeTypes: Set<string>;
        nodes: Array<{
            id: string;
            type: string;
            mention: string;
        }>;
    }> {
        const nodes = Array.from(this.nodes.values())
            .filter(node => node.type !== 'episode')
            .filter(node => 
                node.createdAt <= date && 
                (!node.expiredAt || node.expiredAt > date) &&
                (!node.validAt || node.validAt <= date)
            );

        const nodeTypes = new Set(nodes.map(node => node.type));
        
        return {
            nodeCount: nodes.length,
            nodeTypes,
            nodes: nodes.map(node => ({
                id: node.id,
                type: node.type,
                mention: node.content.mention
            }))
        };
    }

    async findConnectedNodes(options: {
        startId: string;
        edgeTypes?: string[];
        nodeTypes?: string[];
        direction?: 'incoming' | 'outgoing' | 'both';
        limit?: number;
    }): Promise<IGraphNode[]> {
        return [];
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
        const type = data.type ? data.type : 'default';
        const content = data.content ? data.content : {};
        const id = data.id || this.idGenerator.generateNodeId({ type, content });
        const timestamp = new Date();
        return {
            id,
            type,
            metadata: data.metadata ?? new Map(),
            createdAt: timestamp,
            expiredAt: data.expiredAt,
            validAt: data.validAt,
            content,
            edges: [] // Initialize edges property
        };
    }

    createEdge(data: Partial<IGraphEdge>): IGraphEdge {
        const sourceId = data.sourceId ? data.sourceId : '';
        const targetId = data.targetId ? data.targetId : '';
        const type = data.type ? data.type : 'default';
        const fact = data.fact ? data.fact : '';
        const id = data.id || this.idGenerator.generateEdgeId({
            sourceId,
            targetId,
            type,
            content: data.content
        });
        const timestamp = new Date();
        return {
            id,
            sourceId,
            targetId,
            type,
            metadata: data.metadata ?? new Map(),
            createdAt: timestamp,
            expiredAt: data.expiredAt,
            validAt: data.validAt,
            invalidAt: data.invalidAt,
            fact,
            content: data.content ?? {}
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
