import {
    IGraphNode,
    IGraphEdge,
    IGraphStorage,
    GraphMemoryType,
    IGraphMemoryUnit,
    isEpisodeNode,
    EpisodeFilter,
    GraphFilter,
    TraversalOptions,
    EpisodeContent
} from './data/types';
import { GraphTask, LLMConfig } from './types';
import { InMemoryGraphStorage } from './data/InMemoryGraphStorage';
import { MemoryGraph } from './data/operations';
import { GraphLLMProcessor } from './processing/episodic/processor';
import { TemporalHybridSearch } from './query/hybrid';
import { EmbeddingSearch } from './query/embedding';
import { BM25Search } from './query/bm25';
import { ResultReranker } from './query/reranking';
import { OpenAI } from 'openai';
import { IEmbedder, EmbedderProvider } from './embedder/types';
import { EmbedderFactory } from './embedder/factory';

/**
 * Configuration for graph operations
 */
export interface GraphConfig {
    llm: LLMConfig;
    storage?: {
        type: 'memory' | 'neo4j';
        config?: any;
    };
    embedder?: {
        provider: EmbedderProvider;
        config?: any;
    };
    search?: {
        textWeight: number;
        embeddingWeight: number;
        minTextScore: number;
        minEmbeddingScore: number;
        limit: number;
    };
}

/**
 * GraphManager serves as the single access point for all graph operations.
 * It initializes and manages all necessary components (storage, search, LLM, etc.)
 * and provides a clean API for interacting with the graph system.
 */
export class GraphManager {
    private storage: IGraphStorage;
    private graph: MemoryGraph;
    private llmProcessor: GraphLLMProcessor;
    private _hybridSearch: TemporalHybridSearch;
    private communityDetector: any;
    private embedder: IEmbedder;

    constructor(config: GraphConfig) {
        if (!config.llm) {
            throw new Error('LLM configuration is required');
        }

        // Initialize storage based on config
        if (config.storage?.type === 'memory') {
            this.storage = new InMemoryGraphStorage();
        } else if (config.storage?.type === 'neo4j') {
            // TODO: Add Neo4j storage support when needed
            throw new Error('Neo4j storage not yet supported');
        } else {
            // Default to in-memory storage
            this.storage = new InMemoryGraphStorage();
        }

        // Initialize OpenAI client
        const openai = new OpenAI({
            apiKey: config.llm.apiKey,
            baseURL: config.llm.baseURL,
        });

        // Initialize LLM processor with OpenAI client and config
        this.llmProcessor = new GraphLLMProcessor({
            ...config.llm,
            client: openai
        });

        // Initialize embedder based on config
        this.embedder = config.embedder 
            ? EmbedderFactory.create(config.embedder.provider, config.embedder.config)
            : EmbedderFactory.create(EmbedderProvider.BGE); // Default to BGE

        // Initialize graph
        this.graph = new MemoryGraph(this.storage, this.llmProcessor);

        // Initialize search components
        const embeddingSearch = new EmbeddingSearch();
        const textSearch = new BM25Search();
        const reranker = new ResultReranker(
            this.graph,
            {  
                generateText: async (prompt: string) => {
                    const result = await this.llmProcessor.process<{ text: string }>(
                        GraphTask.SUMMARIZE_NODE,  // Use an existing task
                        { prompt }
                    );
                    return result.text;
                }
            }
        );
        const searchConfig = config.search || {
            textWeight: 0.4,
            embeddingWeight: 0.6,
            minTextScore: 0.1,
            minEmbeddingScore: 0.5,
            limit: 10
        };

        // Initialize hybrid search with embedding and text search
        this._hybridSearch = new TemporalHybridSearch(
            embeddingSearch,
            textSearch,
            reranker,
            this.graph,
            searchConfig
        );
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

    /**
     * Get the hybrid search instance
     */
    get hybridSearch(): TemporalHybridSearch {
        return this._hybridSearch;
    }

    /**
     * Update community assignment for a node
     */
    async updateNodeCommunity(nodeId: string): Promise<{
        communityId: string;
        divergenceScore: number;
    }> {
        const node = await this.getNode(nodeId);
        if (!node) {
            throw new Error(`Node ${nodeId} not found`);
        }

        const edges = await this.getNodeEdges(nodeId);
        return this.communityDetector.updateNodeCommunity(node, edges);
    }

    /**
     * Refresh a specific community
     */
    async refreshCommunity(communityId: string): Promise<void> {
        return this.communityDetector.refreshCommunity(communityId);
    }

    /**
     * Get community summary using map-reduce style summarization
     */
    async getCommunityMeta(communityId: string): Promise<{
        summary: string;
        lastUpdateTime: Date;
        memberCount: number;
        divergenceScore: number;
    }> {
        return this.communityDetector.getCommunityMeta(communityId);
    }

    /**
     * Get the current divergence score for a community
     */
    async getCommunityDivergence(communityId: string): Promise<number> {
        return this.communityDetector.getCommunityDivergence(communityId);
    }

    /**
     * Get all communities that need refresh based on divergence score
     */
    async getCommunitiesNeedingRefresh(threshold: number): Promise<string[]> {
        return this.communityDetector.getCommunitiesNeedingRefresh(threshold);
    }

    /**
     * Get all edges connected to a node
     */
    async getNodeEdges(nodeId: string): Promise<IGraphEdge[]> {
        return this.graph.getEdges([nodeId]);
    }

    /**
     * Summarizes a node by combining its context and history into a concise summary
     * @param nodeName Name of the node to summarize
     * @param context Additional context to consider
     * @returns Summary object containing main summary, description, and key points
     */
    async summarizeNode(nodeName: string, context: string = ''): Promise<{
        summary: string;
        description: string;
        key_points: string[];
    }> {
        // Get existing node data
        const node = await this.storage.getNode(nodeName);
        const previousSummary = node?.content?.summary;

        // Get relevant episodes by finding edges between episodes and this node
        const { nodes: allNodes, edges } = await this.storage.query({
            nodeTypes: ['episode']
        });

        // Find episodes connected to this node
        const episodeNodes = allNodes
            .filter(isEpisodeNode)
            .filter(episode => edges.some(edge => 
                (edge.sourceId === episode.id && edge.targetId === nodeName) ||
                (edge.sourceId === nodeName && edge.targetId === episode.id)
            ))
            .sort((a, b) => a.validAt!.getTime() - b.validAt!.getTime());

        // Process summarization
        const result = await this.llmProcessor.process<{
            summary: string;
            description: string;
            key_points: string[];
        }>(GraphTask.SUMMARIZE_NODE, {
            nodeName,
            previousSummary,
            context,
            episodes: episodeNodes
        });

        // Update node with new summary if it exists
        if (node) {
            await this.storage.updateNode(node.id, {
                content: {
                    ...node.content,
                    summary: result.summary
                }
            });
        }

        return result;
    }

    /**
     * Invalidates edges that are superseded by new information
     * @param newEdge The new edge that potentially invalidates existing edges
     * @param existingEdges Existing edges to check for invalidation
     * @param timestamp When the invalidation occurs
     * @returns Updated existing edges with invalidation timestamps set
     */
    async invalidateEdges<T>(
        newEdge: IGraphEdge<T>,
        existingEdges: IGraphEdge<T>[],
        timestamp: Date
    ): Promise<IGraphEdge<T>[]> {
        // Process edge invalidation using LLM
        const result = await this.llmProcessor.process<{
            invalidatedEdges: string[];  // IDs of edges that should be invalidated
            reason: string;  // Reason for invalidation
        }>(GraphTask.INVALIDATE_EDGES, {
            newEdge,
            existingEdges,
            timestamp
        });

        // Update invalidated edges
        const updatedEdges = await Promise.all(
            existingEdges.map(async edge => {
                if (result.invalidatedEdges.includes(edge.id)) {
                    await this.storage.updateEdge(edge.id, {
                        ...edge,
                        invalidAt: timestamp
                    });
                    return { ...edge, invalidAt: timestamp };
                }
                return edge;
            })
        );

        return updatedEdges;
    }

    /**
     * Expands a search query with related terms and context
     * @param query Original search query
     * @param context Additional context to consider
     * @returns Expanded query with related terms
     */
    async expandQuery(query: string, context: string = ''): Promise<{
        expandedQuery: string;
        relatedTerms: string[];
        expansionReason: string;
    }> {
        // Process query expansion using LLM
        const result = await this.llmProcessor.process<{
            expandedQuery: string;
            relatedTerms: string[];
            expansionReason: string;
        }>(GraphTask.EXPAND_QUERY, {
            query,
            context,
            // Get some recent episodes for context
            recentEpisodes: await this.getRecentEpisodes(5)
        });

        return result;
    }

    /**
     * Helper method to get recent episodes
     * @param limit Number of episodes to retrieve
     * @returns Recent episodes sorted by timestamp
     */
    private async getRecentEpisodes(limit: number = 5): Promise<IGraphNode<EpisodeContent>[]> {
        const { nodes } = await this.storage.query({
            nodeTypes: ['episode']
        });

        return nodes
            .filter(isEpisodeNode)
            .sort((a, b) => b.validAt!.getTime() - a.validAt!.getTime())
            .slice(0, limit);
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

    /**
     * Extract searchable text content from a node
     */
    private extractSearchableText(node: IGraphNode): string {
        if (isEpisodeNode(node)) {
            return node.content.body;  // Use body instead of text
        }
        return node.content?.toString() || '';
    }

    /**
     * Index a node for search
     */
    async indexNode(node: IGraphNode): Promise<void> {
        const text = this.extractSearchableText(node);
        const embedding = await this.embedder.generateEmbeddings(text);
        await this._hybridSearch.indexNode(node, embedding[0]);
    }

    /**
     * Search for nodes using hybrid search
     */
    async search(query: string, filter?: GraphFilter): Promise<IGraphNode[]> {
        // Get embedding for query
        const embeddings = await this.embedder.generateEmbeddings(query);
        
        // Perform hybrid search with temporal awareness
        const searchResults = await this._hybridSearch.searchWithTemporal(
            query,
            embeddings[0],
            filter
        );
        
        // Map search results back to nodes with scores
        const nodes = await Promise.all(
            searchResults.map(async result => {
                const node = await this.getNode(result.id);
                if (node) {
                    // Add search score and confidence to metadata
                    node.metadata.set('search_score', result.score.toString());
                    node.metadata.set('search_confidence', result.confidence.toString());
                    if (result.source) {
                        node.metadata.set('search_source', result.source);
                    }
                }
                return node;
            })
        );
        
        // Filter out null results and sort by score
        return nodes
            .filter((node): node is IGraphNode => node !== null)
            .sort((a, b) => {
                const scoreA = parseFloat(a.metadata.get('search_score') || '0');
                const scoreB = parseFloat(b.metadata.get('search_score') || '0');
                return scoreB - scoreA;
            });
    }

    /**
     * Clear all data from the graph
     */
    public async clear(): Promise<void> {
        // Clear graph storage
        const nodes = await this.storage.query({ nodeTypes: ['entity'] });
        for (const node of nodes.nodes) {
            await this.storage.deleteNode(node.id);
        }
        
        // Clear embeddings if embedder exists
        if (this.embedder) {
            await this.embedder.clear();
        }
    }
}
