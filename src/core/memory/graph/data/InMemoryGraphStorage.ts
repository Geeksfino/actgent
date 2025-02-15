import { IGraphStorage, IGraphNode, IGraphEdge, GraphFilter, MemoryType, TraversalOptions, IGraphUnit, isEpisodeNode, EpisodeFilter } from './types';
import { EpisodeContent } from '../types';
import crypto from 'crypto';
import { IdGenerator } from '../id/IdGenerator';

/**
 * Serializes a graph node into a JSON-friendly format
 */
export function toJSON<T>(node: IGraphNode<T>) {
    // Remove edges from node before serializing
    const { edges: _, ...nodeWithoutEdges } = node;
    return {
        id: nodeWithoutEdges.id,
        type: nodeWithoutEdges.type,
        content: nodeWithoutEdges.content,
        metadata: Object.fromEntries(nodeWithoutEdges.metadata),
        createdAt: nodeWithoutEdges.createdAt.toISOString(),
        expiredAt: nodeWithoutEdges.expiredAt?.toISOString(),
        validAt: nodeWithoutEdges.validAt?.toISOString(),
        embedding: nodeWithoutEdges.embedding ? Array.from(nodeWithoutEdges.embedding) : undefined,
        relationships: nodeWithoutEdges.relationships
    };
}

/**
 * In-memory implementation of graph storage
 */
export class InMemoryGraphStorage implements IGraphStorage {
    private nodes: Map<string, IGraphNode>;
    private edges: Map<string, IGraphEdge>;
    private idGenerator: IdGenerator;

    constructor(idGenerator: IdGenerator, maxCapacity: number = 1000) {
        this.idGenerator = idGenerator;
        this.nodes = new Map();
        this.edges = new Map();
    }

    // Graph-specific operations
    async addNode(node: IGraphNode): Promise<string> {
        const id = node.id || this.idGenerator.generateNodeId({ type: node.type, content: node.content });
        node.id = id;
        
        // Initialize with empty edges array for backward compatibility
        const nodeWithEmptyEdges = {
            ...node,
            edges: []
        };
        
        //console.log('Adding node to storage:', toJSON(nodeWithEmptyEdges));
        this.nodes.set(id, nodeWithEmptyEdges);
        return id;
    }

    async getNode(id: string): Promise<IGraphNode | null> {
        return this.nodes.get(id) || null;
    }

    async updateNode(id: string, updates: Partial<IGraphNode>): Promise<void> {
        const node = await this.getNode(id);
        if (!node) throw new Error(`Node ${id} not found`);
        
        // Remove edges from updates
        const { edges: _, ...updatesWithoutEdges } = updates;
        Object.assign(node, updatesWithoutEdges);
        
        this.nodes.set(id, node);
    }

    async deleteNode(id: string): Promise<void> {
        // Remove the node
        this.nodes.delete(id);
        
        // Remove any edges connected to this node
        for (const [edgeId, edge] of this.edges.entries()) {
            if (edge.sourceId === id || edge.targetId === id) {
                this.edges.delete(edgeId);
            }
        }
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

        // Store edge in edges map
        this.edges.set(id, edge);
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
    }

    async deleteEdge(id: string): Promise<void> {
        this.edges.delete(id);
    }

    async getNeighbors(nodeId: string): Promise<IGraphNode[]> {
        const edges = Array.from(this.edges.values());
        const neighborIds = new Set<string>();
        
        // Find all edges connected to this node
        edges.forEach(edge => {
            if (edge.sourceId === nodeId) {
                neighborIds.add(edge.targetId);
            }
            if (edge.targetId === nodeId) {
                neighborIds.add(edge.sourceId);
            }
        });

        // Get all neighbor nodes
        const neighbors: IGraphNode[] = [];
        for (const id of neighborIds) {
            const node = await this.getNode(id);
            if (node) neighbors.push(node);
        }

        return neighbors;
    }

    async getEdges(nodeIds: string[]): Promise<IGraphEdge[]> {
        return Array.from(this.edges.values()).filter(edge => 
            nodeIds.includes(edge.sourceId) || nodeIds.includes(edge.targetId)
        );
    }

    async query(filter: GraphFilter = {}): Promise<{ nodes: IGraphNode[]; edges: IGraphEdge[] }> {
        const nodes = Array.from(this.nodes.values());
        const edges = Array.from(this.edges.values());
        
        return {
            nodes: nodes.filter(node => this.matchesFilter(node, filter)),
            edges: edges.filter(edge => this.matchesEdgeFilter(edge, filter))
        };
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
            
            // Get all edges connected to this node
            const connectedEdges = await this.getEdges([nodeId]);
            connectedEdges.forEach(edge => {
                edges.add(edge);
                if (edge.sourceId === nodeId) {
                    queue.push({ nodeId: edge.targetId, depth: depth + 1 });
                } else {
                    queue.push({ nodeId: edge.sourceId, depth: depth + 1 });
                }
            });
        }
        
        return { nodes, edges: Array.from(edges) };
    }

    async invalidateEdge(edgeId: string, at: Date): Promise<void> {
        // No-op
    }

    async clear(): Promise<void> {
        this.nodes.clear();
        this.edges.clear();
    }

    async findNodes(filter: GraphFilter): Promise<IGraphNode[]> {
        const nodes = Array.from(this.nodes.values());
        return nodes.filter(node => this.matchesFilter(node, filter));
    }

    async findEdges(filter: GraphFilter): Promise<IGraphEdge[]> {
        const edges = Array.from(this.edges.values());
        return edges.filter(edge => this.matchesEdgeFilter(edge, filter));
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

    private matchesFilter(node: IGraphNode, filter: GraphFilter): boolean {
        if (filter.nodeTypes && !filter.nodeTypes.includes(node.type)) {
            return false;
        }
        if (filter.temporal) {
            return this.applyTemporalFilter(node, filter.temporal);
        }
        return true;
    }

    private matchesEdgeFilter(edge: IGraphEdge, filter: GraphFilter): boolean {
        if (filter.edgeTypes && !filter.edgeTypes.includes(edge.type)) {
            return false;
        }
        if (filter.temporal) {
            return this.applyTemporalFilter(edge, filter.temporal);
        }
        return true;
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
