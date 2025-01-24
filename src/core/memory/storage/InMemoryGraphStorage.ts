import { IGraphStorage } from '../storage';
import { InMemoryStorage } from './InMemoryStorage';
import { IGraphNode, IGraphEdge, GraphFilter, GraphResult } from '../graph/types';
import { TemporalIndex } from '../graph/temporal';
import { EmbeddingSearch } from '../graph/search/embedding';
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

    async addNode(node: IGraphNode): Promise<string> {
        const id = node.id || crypto.randomUUID();
        node.id = id;

        // Store as both memory unit and graph node
        await super.store(node);
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

        const updated = { ...existing, ...node };
        await this.addNode(updated);
    }

    async findNodes(filter: GraphFilter): Promise<IGraphNode[]> {
        let candidates = new Set(this.nodes.keys());

        // Apply temporal filter
        if (filter.temporal) {
            const temporalIds = this.temporalIndex.findNodesInRange(
                filter.temporal.from || new Date(0),
                filter.temporal.to || new Date(),
                filter.temporal.timelineType
            );
            candidates = new Set(temporalIds.filter(id => candidates.has(id)));
        }

        // Apply type filter
        if (filter.nodeTypes?.length) {
            candidates = new Set(
                Array.from(candidates).filter(id => {
                    const node = this.nodes.get(id);
                    return node && filter.nodeTypes!.includes(node.type);
                })
            );
        }

        // Apply metadata filter
        if (filter.metadata?.size) {
            candidates = new Set(
                Array.from(candidates).filter(id => {
                    const node = this.nodes.get(id);
                    if (!node) return false;
                    
                    for (const [key, value] of filter.metadata!) {
                        if (node.metadata.get(key) !== value) return false;
                    }
                    return true;
                })
            );
        }

        // Apply distance filter if centerId is provided
        if (filter.metadata?.get('centerId') && filter.maxDistance) {
            const centerId = filter.metadata.get('centerId');
            candidates = new Set(
                Array.from(candidates).filter(id => 
                    this.getShortestPathLength(centerId, id) <= filter.maxDistance!
                )
            );
        }

        return Array.from(candidates).map(id => this.nodes.get(id)!);
    }

    async addEdge(edge: IGraphEdge): Promise<string> {
        const id = edge.id || crypto.randomUUID();
        edge.id = id;

        // Store edge
        this.edges.set(id, edge);
        
        // Update adjacency list
        if (!this.adjacencyList.has(edge.sourceId)) {
            this.adjacencyList.set(edge.sourceId, new Set());
        }
        this.adjacencyList.get(edge.sourceId)!.add(edge.targetId);

        // Update temporal index
        this.temporalIndex.addNode(id, edge.temporal);

        return id;
    }

    async updateEdge(id: string, edge: Partial<IGraphEdge>): Promise<void> {
        const existing = this.edges.get(id);
        if (!existing) {
            throw new Error(`Edge ${id} not found`);
        }

        const updated = { ...existing, ...edge };
        await this.addEdge(updated);
    }

    async findEdges(filter: GraphFilter): Promise<IGraphEdge[]> {
        let candidates = new Set(this.edges.keys());

        // Apply filters similar to findNodes
        if (filter.temporal) {
            const temporalIds = this.temporalIndex.findNodesInRange(
                filter.temporal.from || new Date(0),
                filter.temporal.to || new Date(),
                filter.temporal.timelineType
            );
            candidates = new Set(temporalIds.filter(id => candidates.has(id)));
        }

        if (filter.edgeTypes?.length) {
            candidates = new Set(
                Array.from(candidates).filter(id => {
                    const edge = this.edges.get(id);
                    return edge && filter.edgeTypes!.includes(edge.type);
                })
            );
        }

        return Array.from(candidates).map(id => this.edges.get(id)!);
    }

    async getNeighbors(nodeId: string): Promise<IGraphNode[]> {
        const neighbors = this.adjacencyList.get(nodeId) || new Set();
        return Array.from(neighbors)
            .map(id => this.nodes.get(id))
            .filter((node): node is IGraphNode => node !== undefined);
    }

    async findPath(sourceId: string, targetId: string): Promise<IGraphEdge[]> {
        // Simple BFS implementation
        const visited = new Set<string>();
        const queue: Array<{ id: string; path: IGraphEdge[] }> = [{ id: sourceId, path: [] }];
        
        while (queue.length > 0) {
            const { id, path } = queue.shift()!;
            
            if (id === targetId) {
                return path;
            }
            
            if (!visited.has(id)) {
                visited.add(id);
                const neighbors = this.adjacencyList.get(id) || new Set();
                
                for (const neighborId of neighbors) {
                    const edge = Array.from(this.edges.values())
                        .find(e => e.sourceId === id && e.targetId === neighborId);
                    
                    if (edge) {
                        queue.push({
                            id: neighborId,
                            path: [...path, edge]
                        });
                    }
                }
            }
        }
        
        return []; // No path found
    }

    async getSubgraph(filter: GraphFilter): Promise<GraphResult> {
        const nodes = await this.findNodes(filter);
        const edges = await this.findEdges(filter);
        return { nodes, edges };
    }

    private getShortestPathLength(sourceId: string, targetId: string): number {
        // Simple BFS to find shortest path length
        const visited = new Set<string>();
        const queue: Array<{ id: string; distance: number }> = [{ id: sourceId, distance: 0 }];
        
        while (queue.length > 0) {
            const { id, distance } = queue.shift()!;
            
            if (id === targetId) {
                return distance;
            }
            
            if (!visited.has(id)) {
                visited.add(id);
                const neighbors = this.adjacencyList.get(id) || new Set();
                
                for (const neighborId of neighbors) {
                    queue.push({
                        id: neighborId,
                        distance: distance + 1
                    });
                }
            }
        }
        
        return Infinity; // No path found
    }
}
