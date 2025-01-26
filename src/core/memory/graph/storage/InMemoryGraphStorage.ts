import { IGraphStorage } from '../../storage';
import { InMemoryStorage } from '../../storage/InMemoryStorage';
import { IGraphNode, IGraphEdge, GraphFilter } from '../types';
import { TemporalIndex } from '../temporal';
import { EmbeddingSearch } from '../search/embedding';
import { IMemoryUnit, MemoryFilter } from '../../base';
import crypto from 'crypto';

/**
 * In-memory implementation of graph storage
 */
export class InMemoryGraphStorage extends InMemoryStorage implements IGraphStorage {
    private nodes: Map<string, IGraphNode>;
    private edges: Map<string, IGraphEdge>;
    private temporalIndex: TemporalIndex;
    private embeddingSearch: EmbeddingSearch;
    private adjacencyList: Map<string, Set<string>>;

    constructor(maxCapacity: number = 1000) {
        super(maxCapacity);
        this.nodes = new Map();
        this.edges = new Map();
        this.temporalIndex = new TemporalIndex();
        this.embeddingSearch = new EmbeddingSearch();
        this.adjacencyList = new Map();
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
        
        // Update indices
        this.temporalIndex.addNode(id, node.temporal);
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
        const nodes: IGraphNode[] = [];
        
        for (const [_, node] of this.nodes) {
            let matches = true;

            // Check node types
            if (filter.nodeTypes && !filter.nodeTypes.includes(node.type)) {
                matches = false;
            }

            // Check temporal constraints
            if (filter.temporal) {
                const { from, to, timelineType = 'event' } = filter.temporal;
                const time = timelineType === 'event' ? 
                    node.temporal.eventTime : 
                    node.temporal.ingestionTime;

                if (from && time < from) matches = false;
                if (to && time > to) matches = false;
            }

            // Check metadata
            if (filter.metadata) {
                for (const [key, value] of filter.metadata) {
                    if (node.metadata.get(key) !== value) {
                        matches = false;
                        break;
                    }
                }
            }

            if (matches) nodes.push(node);
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

        this.edges.set(id, edge);

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

    private isGraphNode(memory: IMemoryUnit): memory is IGraphNode {
        return 'type' in memory && 'temporal' in memory;
    }
}
