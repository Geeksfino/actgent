import { IGraphStorage } from '../../storage';
import { InMemoryStorage } from '../../storage/InMemoryStorage';
import { IGraphNode, IGraphEdge, GraphFilter, TemporalMode } from '../types';
import { IMemoryUnit, MemoryFilter } from '../../base';
import { EmbeddingSearch } from '../search/embedding';
import crypto from 'crypto';

/**
 * In-memory implementation of graph storage
 */
export class InMemoryGraphStorage extends InMemoryStorage implements IGraphStorage {
    private nodes: Map<string, IGraphNode>;
    private edges: Map<string, IGraphEdge>;
    private adjacencyList: Map<string, Set<string>>;
    private embeddingSearch: EmbeddingSearch;
    
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
        super(maxCapacity);
        this.nodes = new Map();
        this.edges = new Map();
        this.adjacencyList = new Map();
        this.embeddingSearch = new EmbeddingSearch();
        
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

    // IMemoryStorage implementation
    async store(memory: IMemoryUnit): Promise<void> {
        await super.store(memory);
        if (this.isGraphNode(memory)) {
            await this.addNode(memory);
        }
    }

    async retrieve(id: string): Promise<IMemoryUnit | null> {
        return this.nodes.get(id) || null;
    }

    async retrieveByFilter(filter: MemoryFilter): Promise<IMemoryUnit[]> {
        return this.findNodes({
            ...filter,
            nodeTypes: filter.types ? [filter.types.toString()] : undefined
        });
    }

    async update(memory: IMemoryUnit): Promise<void> {
        if (this.isGraphNode(memory)) {
            await this.updateNode(memory.id, memory);
        }
    }

    async delete(id: string): Promise<void> {
        this.nodes.delete(id);
        // Clean up edges
        const edges = Array.from(this.edges.values())
            .filter(e => e.sourceId === id || e.targetId === id);
        for (const edge of edges) {
            this.edges.delete(edge.id);
        }
        // Clean up adjacency list
        this.adjacencyList.delete(id);
        for (const [_, neighbors] of this.adjacencyList) {
            neighbors.delete(id);
        }
    }

    // Graph-specific operations
    async addNode(node: IGraphNode): Promise<string> {
        const id = node.id || crypto.randomUUID();
        node.id = id;

        // Store as both memory unit and graph node
        this.nodes.set(id, node);
        
        // Update temporal indices
        this.nodeTemporalIndex.byCreatedAt.set(node.id, node.createdAt);
        if (node.expiredAt) {
            this.nodeTemporalIndex.byExpiredAt.set(node.id, node.expiredAt);
        }
        if (node.validAt) {
            this.nodeTemporalIndex.byValidAt.set(node.id, node.validAt);
        }

        // Update embedding search if available
        if (node.metadata?.get('embedding')) {
            this.embeddingSearch.addEmbedding(id, node.metadata.get('embedding'));
        }

        return id;
    }

    async updateNode(id: string, node: Partial<IGraphNode>): Promise<void> {
        const existing = this.nodes.get(id);
        if (!existing) {
            throw new Error(`Node ${id} not found`);
        }

        const updated = { ...existing, ...node, id };
        await this.addNode(updated);
    }

    async findNodes(filter: GraphFilter): Promise<IGraphNode[]> {
        let nodes = Array.from(this.nodes.values());
        
        // Apply type filter
        if (filter.nodeTypes?.length) {
            nodes = nodes.filter(node => filter.nodeTypes!.includes(node.type));
        }
        
        // Apply temporal filter
        if (filter.temporal) {
            const { createdAfter, createdBefore, expiredAfter, expiredBefore,
                   validAfter, validBefore } = filter.temporal;
                   
            nodes = nodes.filter(node => {
                if (createdAfter && node.createdAt < createdAfter) return false;
                if (createdBefore && node.createdAt > createdBefore) return false;
                if (expiredAfter && node.expiredAt && node.expiredAt < expiredAfter) return false;
                if (expiredBefore && node.expiredAt && node.expiredAt > expiredBefore) return false;
                if (validAfter && node.validAt && node.validAt < validAfter) return false;
                if (validBefore && node.validAt && node.validAt > validBefore) return false;
                return true;
            });
        }
        
        // Apply metadata filter
        if (filter.metadata?.size) {
            nodes = nodes.filter(node => {
                for (const [key, value] of filter.metadata!.entries()) {
                    if (node.metadata.get(key) !== value) return false;
                }
                return true;
            });
        }
        
        return nodes;
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

    async addEdge(edge: IGraphEdge): Promise<string> {
        const id = edge.id || crypto.randomUUID();
        edge.id = id;

        // Validate that source and target nodes exist
        if (!this.nodes.has(edge.sourceId) || !this.nodes.has(edge.targetId)) {
            throw new Error('Source or target node does not exist');
        }

        this.edges.set(id, edge);

        // Update temporal indices
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

        // Update adjacency list
        let sourceNeighbors = this.adjacencyList.get(edge.sourceId);
        if (!sourceNeighbors) {
            sourceNeighbors = new Set();
            this.adjacencyList.set(edge.sourceId, sourceNeighbors);
        }
        sourceNeighbors.add(edge.targetId);

        let targetNeighbors = this.adjacencyList.get(edge.targetId);
        if (!targetNeighbors) {
            targetNeighbors = new Set();
            this.adjacencyList.set(edge.targetId, targetNeighbors);
        }
        targetNeighbors.add(edge.sourceId);

        return id;
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
        // Get similar node IDs from embedding search
        const nodeIds = this.embeddingSearch.search(embedding, limit);
        
        // Retrieve full node objects
        return nodeIds
            .map(id => this.nodes.get(id))
            .filter((node): node is IGraphNode => node !== undefined);
    }

    async findValidAt(date: Date, mode: TemporalMode = TemporalMode.BUSINESS_TIME): Promise<{nodes: IGraphNode[], edges: IGraphEdge[]}> {
        let nodes = Array.from(this.nodes.values());
        let edges = Array.from(this.edges.values());
        
        switch (mode) {
            case TemporalMode.SYSTEM_TIME:
                // Filter by system time
                nodes = nodes.filter(node => 
                    node.createdAt <= date && (!node.expiredAt || node.expiredAt > date)
                );
                edges = edges.filter(edge =>
                    edge.createdAt <= date && (!edge.expiredAt || edge.expiredAt > date)
                );
                break;
                
            case TemporalMode.BUSINESS_TIME:
                // Filter by business time
                nodes = nodes.filter(node =>
                    !node.validAt || node.validAt <= date
                );
                edges = edges.filter(edge =>
                    (!edge.validAt || edge.validAt <= date) &&
                    (!edge.invalidAt || edge.invalidAt > date)
                );
                break;
                
            case TemporalMode.BI_TEMPORAL:
                // Filter by both system and business time
                nodes = nodes.filter(node =>
                    node.createdAt <= date &&
                    (!node.expiredAt || node.expiredAt > date) &&
                    (!node.validAt || node.validAt <= date)
                );
                edges = edges.filter(edge =>
                    edge.createdAt <= date &&
                    (!edge.expiredAt || edge.expiredAt > date) &&
                    (!edge.validAt || edge.validAt <= date) &&
                    (!edge.invalidAt || edge.invalidAt > date)
                );
                break;
        }
        
        return { nodes, edges };
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

    async getNode(id: string): Promise<IGraphNode | null> {
        return this.nodes.get(id) || null;
    }

    async getEdge(id: string): Promise<IGraphEdge | null> {
        return this.edges.get(id) || null;
    }

    private isGraphNode(memory: IMemoryUnit): memory is IGraphNode {
        return 'type' in memory && 'temporal' in memory;
    }
}
