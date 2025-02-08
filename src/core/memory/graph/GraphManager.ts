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
import { EpisodicGraphProcessor } from './processing/episodic/processor';
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
 * Search options
 */
export interface SearchOptions {
    timestamp?: Date;
    limit?: number;
    filters?: {
        role?: string;
        timeRange?: [Date, Date];
        nodeTypes?: string[];
    };
}

/**
 * Search result
 */
export interface SearchResult {
    node: IGraphNode;
    score: number;
    confidence: number;
}

/**
 * GraphManager serves as the single access point for all graph operations.
 * It initializes and manages all necessary components (storage, search, LLM, etc.)
 * and provides a clean API for interacting with the graph system.
 */
export class GraphManager {
    private storage: IGraphStorage;
    private embedder?: IEmbedder;
    private llmClient: any;
    private llm: EpisodicGraphProcessor;
    private graph: MemoryGraph;
    private _hybridSearch: TemporalHybridSearch;

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
        this.llm = new EpisodicGraphProcessor({
            ...config.llm,
            client: openai
        });

        // Initialize embedder based on config
        this.embedder = config.embedder 
            ? EmbedderFactory.create(config.embedder.provider, config.embedder.config)
            : EmbedderFactory.create(EmbedderProvider.BGE); // Default to BGE

        // Initialize graph
        this.graph = new MemoryGraph(this.storage, this.llm);

        // Initialize search components
        const embeddingSearch = new EmbeddingSearch();
        const textSearch = new BM25Search();
        const reranker = new ResultReranker(
            this.graph,
            {  
                generateText: async (prompt: string) => {
                    const result = await this.llm.process<{ text: string }>(
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
     * Ingest one or more messages into the graph
     * Handles:
     * - Creating episode nodes
     * - Extracting entities and relationships using LLM
     * - Building graph connections
     * - Automatic community refinement
     */
    async ingest(messages: Array<{
        id: string,
        body: string,
        role: string,
        timestamp: Date,
        sessionId: string
    }>): Promise<void> {
        const now = new Date();

        // First, create all episode nodes
        for (const message of messages) {
            this.log('Message ID:', message.id);
            // Create episode node
            const episodeNode: IGraphNode<EpisodeContent> = {
                id: `ep_${message.id}`,
                type: 'episode',
                content: {
                    body: message.body,
                    timestamp: message.timestamp,
                    source: message.role,
                    sourceDescription: message.body,
                    sessionId: message.sessionId // Pass sessionId to EpisodeContent
                },
                metadata: new Map([
                    ['role', message.role],
                    ['turnId', message.id],
                    ['sessionId', message.sessionId],
                    ['timestamp', message.timestamp.toISOString()]
                ]),
                createdAt: now,
                validAt: message.timestamp
            };
            this.log('Episode Node:', episodeNode);
            await this.addNode(episodeNode);
        }

        // Get previous context (last 4 messages)
        const { nodes: allNodes } = await this.graph.query({ nodeTypes: ['episode'] });

        this.log('All Nodes Before Sort:', allNodes.map(node => ({ id: node.id, validAt: node.validAt })));

        const prevNodes = allNodes
            .sort((a, b) => (b.validAt?.getTime() || 0) - (a.validAt?.getTime() || 0));

        this.log('All Nodes After Sort:', allNodes.map(node => ({ id: node.id, validAt: node.validAt })));

        const prevMessages = prevNodes
            .slice(0, 4)
            .filter(node => !messages.some(msg => msg.id === node.metadata.get('turnId')))  // Exclude current batch
            .map(node => `${node.content.source}: ${node.content.body}`)
            .join('\n');

        this.log('Previous Messages:', prevMessages);

        // Process all messages in the batch together
        const currentMessages = messages
            .map(msg => `${msg.role}: ${msg.body}`)
            .join('\n');

        // Extract entities and relationships for the entire batch
        const entityResult = await this.processWithLLM(
            GraphTask.EXTRACT_TEMPORAL,
            {
                text: currentMessages,
                context: prevMessages || undefined,
                metadata: {
                    timestamp: messages[0].timestamp  // Use first message's timestamp
                }
            }
        );

        this.log('Entities:', entityResult.entities);
        this.log('Relationships:', entityResult.relationships);

        // Process entities
        if (entityResult.entities && Array.isArray(entityResult.entities)) {
            for (const entity of entityResult.entities) {
                try {
                    await this.addNode({
                        id: `entity_${entity.id}`,
                        type: GraphMemoryType.SEMANTIC,  // Entities are semantic knowledge
                        metadata: new Map([
                            ['entityType', entity.type],  // Store LLM's type (e.g. PERSON, OBJECT) in metadata
                            ['entityName', entity.name],   // Store name in metadata for easier querying
                            ['sessionId', messages[0].sessionId] // Store sessionId in metadata
                        ]),
                        content: {  // Store entity properties in content
                            name: entity.name,
                            summary: entity.summary,
                            sessionId: messages[0].sessionId, // Store sessionId in content
                            ...entity  // Store any other fields from LLM
                        },
                        createdAt: messages[0].timestamp,
                        validAt: messages[0].timestamp
                    });
                    this.log('Added entity node:', { id: `entity_${entity.id}`, type: entity.type });
                } catch (error: unknown) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    this.log('Failed to add entity:', {
                        entityId: `entity_${entity.id}`,
                        type: entity.type,
                        error: errorMessage
                    });
                }
            }
        }

        // Process relationships
        if (entityResult.relationships && Array.isArray(entityResult.relationships)) {
            for (const rel of entityResult.relationships) {
                try {
                    await this.addEdge({
                        id: `rel_${rel.sourceId}_${rel.targetId}`,
                        type: GraphMemoryType.SEMANTIC,  // Relationships are semantic knowledge
                        sourceId: `entity_${rel.sourceId}`,
                        targetId: `entity_${rel.targetId}`,
                        metadata: new Map([
                            ['relationshipType', rel.type],
                            ['relationshipName', rel.name || rel.type],
                            ['description', rel.description || '']
                        ]),
                        content: {
                            type: rel.type,  // Store original type in content
                            ...rel  // Store any additional relationship properties
                        },
                        createdAt: messages[0].timestamp,
                        validAt: messages[0].timestamp
                    });
                    this.log('Added relationship:', {
                        id: `rel_${rel.sourceId}_${rel.targetId}`,
                        type: rel.type,
                        sourceId: `entity_${rel.sourceId}`,
                        targetId: `entity_${rel.targetId}`
                    });
                } catch (error: unknown) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    this.log('Failed to add relationship:', {
                        relationshipId: `rel_${rel.sourceId}_${rel.targetId}`,
                        type: rel.type,
                        error: errorMessage
                    });
                }
            }
        }

        // Refine communities after processing entities and relationships
        await this.refineCommunities(messages[0].sessionId);

        const communityInput = {
            nodes: (await this.graph.query({ nodeTypes: ['entity'] })).nodes,
            metadata: {
                type: 'community',
                lastUpdateTime: new Date().toISOString()
            }
        };
        const communityResponse = await this.processWithLLM(GraphTask.REFINE_COMMUNITIES, communityInput);
        if (communityResponse && communityResponse.communities) {
            for (const community of communityResponse.communities) {
                if (community.id) {
                    // Update community members
                    await this.updateCommunityMembers(community.id, community.members);
                }
            }
        }
    }

    /**
     * Refines communities in the graph.
     */
    async refineCommunities(sessionId: string): Promise<void> {
        console.log("refineCommunities sessionId: ", sessionId);
        const communityInput = {
            nodes: (await this.graph.query({ nodeTypes: ['entity'], sessionId })).nodes,
            metadata: {
                type: 'community',
                lastUpdateTime: new Date().toISOString()
            }
        };
        console.log("refineCommunities communityInput: ", communityInput);
        console.log("refineCommunities nodes: ", communityInput.nodes);
        const communityResponse = await this.processWithLLM(GraphTask.REFINE_COMMUNITIES, communityInput);
        if (communityResponse && communityResponse.communities) {
            for (const community of communityResponse.communities) {
                if (community.id) {
                    // Update community members
                    await this.updateCommunityMembers(community.id, community.members);
                }
            }
        }
    }

    /**
     * Search for relevant messages/episodes/entities using hybrid search
     * Combines embeddings, LLM, and temporal aspects
     */
    async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
        if (!this.embedder) {
            throw new Error('Embedder not configured');
        }

        // Get embedding for query
        const embeddings = await this.embedder.generateEmbeddings(query);
        
        // Perform hybrid search with temporal awareness
        const searchResults = await this._hybridSearch.searchWithTemporal(
            query,
            embeddings[0],
            options
        );
        
        // Map search results back to nodes with scores
        const results = await Promise.all(
            searchResults.map(async result => {
                const node = await this.getNode(result.id);
                if (!node) return null;

                return {
                    node,
                    score: result.score,
                    confidence: result.confidence
                };
            })
        );
        
        // Filter out null results and sort by score
        return results
            .filter((result): result is SearchResult => result !== null)
            .sort((a, b) => b.score - a.score);
    }

    /**
     * Clear all data from the graph and embeddings
     */
    async clear(): Promise<void> {
        // Clear graph storage
        const nodes = await this.graph.query({ nodeTypes: ['entity'] });
        for (const node of nodes.nodes) {
            await this.storage.deleteNode(node.id);
        }
        
        // Clear embeddings if embedder exists
        if (this.embedder) {
            await this.embedder.clear();
        }
    }

    /**
     * Get a snapshot of the graph with optional filters
     * @param filter Optional filter to get specific nodes (e.g., by type)
     * @returns Promise<{ nodes: IGraphNode[], edges: IGraphEdge[] }>
     */
    async getSnapshot(filter: GraphFilter & { sessionId?: string }): Promise<{ nodes: IGraphNode[], edges: IGraphEdge[] }> {
        return this.graph.query(filter);
    }

    // Private methods for internal use
    private async addNode<T>(node: IGraphNode<T>): Promise<string> {
        return this.graph.addNode(node);
    }

    private async addEdge<T>(edge: IGraphEdge<T>): Promise<string> {
        return this.graph.addEdge(edge);
    }

    private async getNode<T>(id: string): Promise<IGraphNode<T> | null> {
        return this.graph.getNode(id);
    }

    private async getEdge<T>(id: string): Promise<IGraphEdge<T> | null> {
        return this.graph.getEdge(id);
    }

    private async processWithLLM(task: GraphTask, data: any): Promise<any> {
        return this.llm.process(task, data);
    }

    private async updateCommunityMembers(communityId: string, members: string[]): Promise<void> {
        // Update community members in the graph
        // This implementation is omitted for brevity
    }

    private log(message: string, data: any) {
        console.log(message, data);
    }
}
