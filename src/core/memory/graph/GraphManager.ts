import { 
    IGraphNode, 
    IGraphEdge, 
    GraphFilter,
    TraversalOptions,
    IGraphStorage,
    GraphMemoryType,
    IGraphMemoryUnit
} from './data/types';
import { GraphTask, GraphConfig, LLMConfig } from './types';
import { InMemoryGraphStorage } from './data/InMemoryGraphStorage';
import { MemoryGraph } from './data/operations';
import { GraphLLMProcessor } from './processing/episodic/processor';
import { HybridSearch } from './query/hybrid';
import { ResultReranker } from './query/reranking';

/**
 * GraphManager serves as the single access point for all graph operations.
 * It initializes and manages all necessary components (storage, search, LLM, etc.)
 * and provides a clean API for interacting with the graph system.
 */
export class GraphManager {
    private storage: IGraphStorage;
    private graph: MemoryGraph;
    private llmProcessor: GraphLLMProcessor;

    constructor(config: GraphConfig) {
        // Initialize components with configurations
        this.storage = new InMemoryGraphStorage();
        this.llmProcessor = new GraphLLMProcessor(
            config.llm.client,
            config.llm.config || {
                model: 'gpt-4',
                temperature: 0.0,
                maxTokens: 1000
            }
        );
        this.graph = new MemoryGraph(this.storage, this.llmProcessor);
    }

    /**
     * Add a node to the graph
     */
    async addNode<T>(node: IGraphNode<T>): Promise<string> {
        return this.graph.addNode(node);
    }

    /**
     * Add an edge to the graph
     */
    async addEdge<T>(edge: IGraphEdge<T>): Promise<string> {
        return this.graph.addEdge(edge);
    }

    /**
     * Get a node by ID
     */
    async getNode<T>(id: string): Promise<IGraphNode<T> | null> {
        return this.graph.getNode(id);
    }

    /**
     * Get an edge by ID
     */
    async getEdge<T>(id: string): Promise<IGraphEdge<T> | null> {
        return this.graph.getEdge(id);
    }

    /**
     * Update a node
     */
    async updateNode<T>(id: string, updates: Partial<IGraphNode<T>>): Promise<void> {
        return this.graph.updateNode(id, updates);
    }

    /**
     * Update an edge
     */
    async updateEdge<T>(id: string, updates: Partial<IGraphEdge<T>>): Promise<void> {
        return this.graph.updateEdge(id, updates);
    }

    /**
     * Delete a node
     */
    async deleteNode(id: string): Promise<void> {
        return this.graph.deleteNode(id);
    }

    /**
     * Delete an edge
     */
    async deleteEdge(id: string): Promise<void> {
        return this.graph.deleteEdge(id);
    }

    /**
     * Query the graph using a filter
     */
    async query(filter: GraphFilter = {}) {
        return this.graph.query(filter);
    }

    /**
     * Find paths between nodes using LLM
     */
    async findPaths(sourceId: string, targetId: string, options?: TraversalOptions) {
        return this.graph.findPathsWithLLM(sourceId, targetId, options);
    }

    /**
     * Find communities in the graph
     */
    async findCommunities(filter?: GraphFilter) {
        return this.graph.findCommunities(filter);
    }

    /**
     * Get nodes by filter
     */
    async getByFilter(filter: GraphFilter): Promise<IGraphNode[]> {
        const result = await this.graph.query(filter);
        return result.nodes;
    }

    /**
     * Get the neighbors of a node
     */
    async getNeighbors(nodeId: string, filter?: GraphFilter): Promise<IGraphNode[]> {
        return this.graph.findConnectedNodes({
            startId: nodeId,
            nodeTypes: filter?.nodeTypes,
            direction: 'both'
        });
    }

    /**
     * Process a custom graph task using LLM
     */
    async processWithLLM<T>(task: GraphTask, data: any): Promise<T> {
        return this.llmProcessor.process(task, data);
    }

    /**
     * Get graph statistics
     */
    async getStats() {
        const result = await this.graph.query({});
        
        return {
            nodeCount: result.nodes.length,
            edgeCount: result.edges.length,
            nodeTypes: this.getNodeTypeDistribution(result.nodes),
            memoryTypes: this.getMemoryTypeDistribution(result.nodes)
        };
    }

    private getNodeTypeDistribution(nodes: IGraphNode[]) {
        const distribution: Record<string, number> = {};
        
        for (const node of nodes) {
            distribution[node.type] = (distribution[node.type] || 0) + 1;
        }
        
        return distribution;
    }

    private getMemoryTypeDistribution(nodes: IGraphNode[]) {
        const distribution: Partial<Record<GraphMemoryType, number>> = {};
        
        for (const node of nodes) {
            const memoryUnit = node as unknown as IGraphMemoryUnit;
            if (memoryUnit.memoryType && Object.values(GraphMemoryType).includes(memoryUnit.memoryType)) {
                distribution[memoryUnit.memoryType] = (distribution[memoryUnit.memoryType] || 0) + 1;
            }
        }
        
        return distribution;
    }
}
