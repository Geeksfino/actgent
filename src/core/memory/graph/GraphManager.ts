import { OpenAI } from 'openai';
import {
    IGraphNode,
    IGraphEdge,
    GraphFilter,
    IGraphStorage,
    EpisodeContent,
    GraphNodeType,
    GraphEdgeType,
    IGraphMemoryUnit,
    TemporalMode,
    isEpisodeNode,
    TraversalOptions
} from './data/types';
import { InMemoryGraphStorage } from './data/InMemoryGraphStorage';
import { EpisodicGraphProcessor } from './processing/episodic/processor';
import { SemanticGraphProcessor } from './processing/semantic/processor';
import { MemoryGraph } from './data/operations';
import { IEmbedder, EmbedderProvider } from './embedder/types';
import { EmbedderFactory } from './embedder/factory';
import { IdGenerator } from './id/IdGenerator';
import { DeterministicIdGenerator } from './id/DeterministicIdGenerator';
import { BM25Search } from './query/bm25';
import { EmbeddingSearch } from './query/embedding';
import { ResultReranker } from './query/reranking';
import { TemporalHybridSearch } from './query/hybrid';
import {
    GraphConfig,
    LLMConfig,
    GraphTask,
    Episode,
    MessageEpisode
} from './types';

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

interface EntityExtractionResult {
    entities: Array<{
        id: number;
        mention: string;
        type: string;
        confidence: number;
        span: {
            start: number;
            end: number;
        };
        metadata: {
            episodeId: string;
            turnId: string;
            sessionId: string;
        };
        relationships?: any;
    }>;
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
    private semanticProcessor: SemanticGraphProcessor;
    private graph: MemoryGraph;
    private idGenerator: IdGenerator;
    private _hybridSearch: TemporalHybridSearch;
    private entities: Map<string, any> = new Map();
    
    // Maximum number of sessions to keep in cache
    private readonly MAX_SESSION_CACHE = 5;
    // Map of sessionId to its messages and last access time
    private sessionCache: Map<string, {
        messages: Array<{
            id: string,
            body: string,
            role: string,
            timestamp: Date,
            sessionId: string
        }>,
        lastAccessed: Date
    }> = new Map();

    constructor(config: GraphConfig, idGenerator: IdGenerator) {
        if (!config.llm) {
            throw new Error('LLM configuration is required');
        }

        // Initialize storage based on config
        if (config.storage?.type === 'memory') {
            this.storage = new InMemoryGraphStorage(new DeterministicIdGenerator());
        } else if (config.storage?.type === 'neo4j') {
            // TODO: Add Neo4j storage support when needed
            throw new Error('Neo4j storage not yet supported');
        } else {
            // Default to in-memory storage
            this.storage = new InMemoryGraphStorage(new DeterministicIdGenerator());
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

        // Initialize semantic processor with OpenAI client and config
        this.semanticProcessor = new SemanticGraphProcessor({
            ...config.llm,
            client: openai
        });

        // Initialize embedder based on config
        this.embedder = config.embedder 
            ? EmbedderFactory.create(config.embedder.provider, config.embedder.config)
            : EmbedderFactory.create(EmbedderProvider.BGE); // Default to BGE
        console.log(`config.embedder.provider: ${config.embedder?.provider}`);

        if (!this.embedder) {
            throw new Error('Failed to initialize embedder');
        }

        // Initialize graph
        this.graph = new MemoryGraph(this.storage, this.llm);

        // Initialize search components
        const embeddingSearch = new EmbeddingSearch(this.embedder);
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

        this.idGenerator = idGenerator;
    }

    /**
     * Process an episode in the graph memory system
     * @param episode Episode to process
     * @param processingLayer Optional, controls depth of processing:
     *   1 = episodic only
     *   2 = episodic + semantic
     *   3 = episodic + semantic + community (default)
     */
    async ingest(episode: Episode, processingLayer: number = 3): Promise<void> {
        if (episode.type !== 'message') {
            throw new Error('Only message episodes are supported currently');
        }

        const messageEpisode = episode as MessageEpisode;
        const messages = messageEpisode.content.map((msg: {
            id: string;
            role: string;
            body: string;
            timestamp: Date;
            turnId: string;
        }) => ({
            ...msg,
            sessionId: episode.sessionId,
            // Use message timestamp if available, fall back to episode reference time
            timestamp: msg.timestamp || episode.referenceTime
        }));

        return this.processMessages(messages, processingLayer);
    }

    /**
     * Internal method to process messages in the graph memory system
     * @param messages Array of messages to process
     * @param processingLayer Optional, controls depth of processing:
     *   1 = episodic only
     *   2 = episodic + semantic
     *   3 = episodic + semantic + community (default)
     * @private
     */
    private async processMessages(messages: Array<{
        id: string,
        body: string,
        role: string,
        timestamp: Date,
        sessionId: string
    }>, processingLayer: number = 3): Promise<void> {
        // Layer 1: Episodic Layer - Raw data capture
        // Create episode nodes and extract temporal information
        await this.createEpisodeNodes(messages);
        const { currentMessages, prevMessages } = await this.prepareMessageContext(messages);

        // Extract mentions and their temporal relationships
        const extractionResult = await this.llm.process<EntityExtractionResult>(GraphTask.EXTRACT_ENTITIES, {
            text: currentMessages,
            context: prevMessages,
            episodeId: messages[0].sessionId // Use sessionId as episodeId since it represents the conversation
        });
        console.log("extractionResult.entities:", JSON.stringify(extractionResult.entities, null, 2));

        // Store raw mentions with temporal metadata
        const extractedMentions = [];
        const llmIdToNodeId = new Map<number, string>(); // Map LLM IDs to our node IDs
        const relationshipUpdates = new Map<string, any>(); // Track all relationship updates

        // First pass: create all nodes and build ID mapping
        for (const entity of extractionResult.entities) {
            // Find the message timestamp based on the session
            const message = messages.find(m => m.sessionId === entity.metadata.sessionId);
            if (!message) {
                console.warn(`No message found for session ${entity.metadata.sessionId}`);
                continue;
            }

            const node: Partial<IGraphNode> = {
                type: entity.type.toUpperCase(),
                content: {
                    mention: entity.mention,
                    span: entity.span,
                    confidence: entity.confidence
                },
                metadata: new Map([
                    ['sessionId', entity.metadata.sessionId],
                    ['timestamp', message.timestamp.toISOString()],
                    ['episodeId', entity.metadata.sessionId],
                    ['turnId', entity.metadata.turnId]
                ]),
                createdAt: new Date(),
                validAt: message.timestamp,
                relationships: {} // Initialize empty, we'll update in second pass
            };

            // Add node to graph
            const nodeId = await this.addNode(node as IGraphNode);
            llmIdToNodeId.set(entity.id, nodeId);
            extractedMentions.push({ ...node, id: nodeId });

            // Track relationships that need to be added
            if (entity.relationships) {
                relationshipUpdates.set(nodeId, {
                    entityId: entity.id,
                    relationships: entity.relationships
                });
            }
        }

        // Second pass: update all relationships using correct node IDs
        for (const [sourceNodeId, data] of relationshipUpdates.entries()) {
            const { entityId, relationships } = data;
            const sourceNode = await this.getNode(sourceNodeId);
            if (!sourceNode) {
                console.warn(`No node found for ID ${sourceNodeId}`);
                continue;
            }

            // Update relationships with correct node IDs
            const updatedRelationships: any = {};
            for (const [relType, relations] of Object.entries(relationships)) {
                updatedRelationships[relType] = (relations as any[])
                    .map(rel => {
                        const targetNodeId = llmIdToNodeId.get(rel.target);
                        if (!targetNodeId) return null;

                        return {
                            ...rel,
                            target: targetNodeId
                        };
                    })
                    .filter(rel => rel !== null);
            }

            // Update the source node's relationships
            if (Object.keys(updatedRelationships).length > 0) {
                await this.storage.updateNode(sourceNodeId, {
                    ...sourceNode,
                    relationships: updatedRelationships
                });
            }
        }

        if (processingLayer > 1) {
            // Layer 2: Semantic Layer - Entity Resolution and Fact Extraction
            
            // Step 1: Entity Resolution
            const deduplicationResult = await this.semanticProcessor.deduplicateEntities(extractedMentions);
            const resolvedEntities = deduplicationResult.entities;

            // Create semantic entities from resolved mentions
            for (const entity of resolvedEntities) {
                const entityId = this.semanticProcessor.generateEntityId(entity.name, entity.type);
                
                // Store semantic entity
                await this.graph.addNode({
                    id: entityId,
                    type: 'entity',
                    content: {
                        name: entity.name,
                        type: entity.type,
                        summary: entity.summary || ''
                    },
                    metadata: new Map([
                        ['entityType', entity.type],
                        ['lastUpdateTime', new Date().toISOString()]
                    ]),
                    createdAt: new Date(),
                    validAt: messages[0].timestamp,
                    edges: []
                });

                // Link mentions to semantic entity
                for (const mentionId of entity.mentionIds) {
                    const edge: Partial<IGraphEdge> = {
                        type: 'REFERS_TO',
                        sourceId: mentionId,
                        targetId: entityId,
                        content: {
                            type: 'REFERS_TO',
                            description: `Mention reference to entity ${entity.name}`
                        },
                        metadata: new Map(),
                        createdAt: new Date(),
                        validAt: messages[0].timestamp
                    };
                    
                    edge.id = this.idGenerator.generateEdgeId(edge);
                    await this.graph.addEdge(edge as IGraphEdge);
                }
            }

            // Step 2: Extract facts between resolved entities
            const extractedFacts = await this.processWithLLM(
                GraphTask.FACT_EXTRACTION,
                {
                    previousMessages: prevMessages,
                    currentMessage: currentMessages,
                    entities: resolvedEntities
                }
            );

            // Get existing edges for fact resolution
            const relevantEntityIds = resolvedEntities.map(entity => entity.id);
            const existingEdges = await this.graph.getEdges(relevantEntityIds);
            const resolvedFacts = await this.resolveFacts(extractedFacts, existingEdges);

            // Create semantic relationships from facts
            for (const fact of resolvedFacts.facts) {
                const edge: Partial<IGraphEdge> = {
                    type: fact.type,
                    sourceId: fact.sourceId,
                    targetId: fact.targetId,
                    content: {
                        type: fact.type,
                        description: fact.text
                    },
                    metadata: new Map([
                        ['confidence', fact.confidence.toString()],
                        ['fact', fact.text]
                    ]),
                    createdAt: new Date(),
                    validAt: messages[0].timestamp
                };
                
                edge.id = this.idGenerator.generateEdgeId(edge);
                await this.graph.addEdge(edge as IGraphEdge);
            }
        }

        if (processingLayer > 2) {
            // Layer 3: Community Layer - Pattern Analysis
            await this.refineCommunities(messages[0].sessionId);
        }

        // Update session cache
        this.updateSessionCache(messages);
    }

    /**
     * Refines communities in the graph by analyzing mention patterns.
     */
    async refineCommunities(sessionId: string): Promise<void> {
        // Get all mentions for this session
        const { nodes: mentions } = await this.graph.query({ 
            nodeTypes: ['mention'], 
            sessionId 
        });

        // Get episodes connected to these mentions
        const episodeEdges = await Promise.all(
            mentions.map((mention: IGraphNode) => 
                this.storage.getEdges([mention.id])
                    .then(edges => edges.filter((e: IGraphEdge) => e.type === 'MENTIONED_IN'))
            )
        );

        // Group mentions by their connected episodes
        const episodeToMentions = new Map<string, IGraphNode[]>();
        mentions.forEach((mention: IGraphNode, index: number) => {
            const episodeEdge = episodeEdges[index][0]; // Take first MENTIONED_IN edge
            if (episodeEdge) {
                const episodeId = episodeEdge.targetId;
                const mentionsForEpisode = episodeToMentions.get(episodeId) || [];
                mentionsForEpisode.push(mention);
                episodeToMentions.set(episodeId, mentionsForEpisode);
            }
        });

        // Process communities
        const communityInput = {
            episodes: Array.from(episodeToMentions.entries()).map(([episodeId, mentions]) => ({
                id: episodeId,
                mentions: mentions.map(m => ({
                    text: m.content.text,
                    type: m.content.entityType
                }))
            })),
            metadata: {
                type: 'community',
                lastUpdateTime: new Date().toISOString()
            }
        };

        const communityResponse = await this.processWithLLM(
            GraphTask.REFINE_COMMUNITIES, 
            communityInput
        );

        // Create community nodes and relationships
        if (communityResponse?.communities) {
            for (const community of communityResponse.communities) {
                const communityNode: Partial<IGraphNode> = {
                    type: 'community',
                    content: {
                        label: community.label,
                        confidence: community.confidence
                    },
                    metadata: new Map([
                        ['sessionId', sessionId],
                        ['timestamp', new Date().toISOString()]
                    ]),
                    createdAt: new Date(),
                    validAt: new Date(),
                    edges: []
                };

                const communityId = this.idGenerator.generateNodeId(communityNode);
                communityNode.id = communityId;
                await this.storage.addNode(communityNode as IGraphNode);

                // Link mentions to community
                for (const mentionId of community.mentions) {
                    const edge: Partial<IGraphEdge> = {
                        type: 'IN_COMMUNITY',
                        sourceId: mentionId,
                        targetId: communityId,
                        content: {
                            type: 'IN_COMMUNITY',
                            description: `Mention in community ${community.label}`
                        },
                        metadata: new Map(),
                        createdAt: new Date(),
                        validAt: new Date()
                    };

                    const edgeId = this.idGenerator.generateEdgeId(edge);
                    edge.id = edgeId;
                    await this.storage.addEdge(edge as IGraphEdge);
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
        const embeddingsStartTime = Date.now();
        const embeddings = await this.embedder!.generateEmbeddings(query);
        const embeddingsEndTime = Date.now();
        console.log(`Embeddings generation took: ${embeddingsEndTime - embeddingsStartTime}ms`);
        
        // Perform hybrid search with temporal awareness
        const searchStartTime = Date.now();
        const searchResults = await this._hybridSearch.searchWithTemporal(
            query,
            embeddings[0],
            options
        );
        const searchEndTime = Date.now();
        console.log(`Hybrid search took: ${searchEndTime - searchStartTime}ms`);
        
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
    async getSnapshot(filter: GraphFilter = {}): Promise<{
        nodes: IGraphNode[];
        edges: IGraphEdge[];
        episodes?: IGraphNode<EpisodeContent>[];
    }> {
        const result = await this.storage.query(filter);
        return result;
    }

    // Private methods for internal use
    private async addNode<T>(node: IGraphNode<T>): Promise<string> {
        return this.graph.addNode(node);
    }

    private async getNode<T>(id: string): Promise<IGraphNode<T> | null> {
        return this.graph.getNode(id);
    }

    /**
     * Process a task using LLM with proper data handling
     */
    private async processWithLLM(task: GraphTask, data: any): Promise<any> {
        console.log("processWithLLM task: ", task);
        if (task === GraphTask.EVALUATE_PATHS || task === GraphTask.FACT_EXTRACTION || task === GraphTask.RESOLVE_FACTS) {
            console.log(`Using semantic processor for task: ${task}`);
            const result = await this.semanticProcessor.process(task, data);
            return result;
        }
        try {
            const llmStartTime = Date.now();
            const result = await this.llm.process(task, data);
            const llmEndTime = Date.now();
            console.log(`LLM processing took: ${llmEndTime - llmStartTime}ms`);
            return result;
        } catch (error) {
            console.error('Failed to process task:', error);
            throw error;
        }
    }

    private async createEpisodeNodes(messages: Array<{
        id: string,
        body: string,
        role: string,
        timestamp: Date,
        sessionId: string
    }>): Promise<void> {
        const now = new Date();
        for (const message of messages) {
            // Check if an episode-specific node already exists
            const baseNodeId = `ep_${message.id}`;
            const episodeNodeId = `${baseNodeId}:${message.sessionId}`;
            const existingNode = await this.storage.getNode(episodeNodeId);

            if (existingNode) {
                console.log(`Episode node already exists: ${episodeNodeId}`);
                return;
            }

            // Create a new node for this episode
            const node: IGraphNode<EpisodeContent> = {
                id: episodeNodeId,
                type: 'episode',
                content: {
                    type: 'message',
                    actor: message.role,
                    content: message.body,
                    metadata: {
                        session_id: message.sessionId,
                        turn_id: message.id,
                        timestamp: message.timestamp,
                        source: message.role
                    }
                },
                metadata: new Map([
                    ['role', message.role],
                    ['turnId', message.id],
                    ['sessionId', message.sessionId],
                    ['timestamp', message.timestamp.toISOString()]
                ]),
                createdAt: now,
                validAt: message.timestamp,
                edges: [] // Initialize edges property
            };
            this.log('Episode Node:', node);
            await this.addNode(node);
        }
    }

    private async prepareMessageContext(messages: Array<{
        id: string,
        body: string,
        role: string,
        timestamp: Date,
        sessionId: string
    }>): Promise<{
        currentMessages: string,
        prevMessages: string
    }> {
        const currentSessionId = messages[0].sessionId;

        // Group current messages into turns (user + assistant pairs)
        let currentTurn = -1;
        const currentMessages = messages
            .reduce((acc: string[], msg, idx) => {
                if (msg.role === 'user') {
                    currentTurn++;
                    acc.push(`[Turn ${currentTurn}]\n${msg.role}: ${msg.body}`);
                } else {
                    // Append assistant's message to the current turn
                    acc[acc.length - 1] += `\n${msg.role}: ${msg.body}`;
                }
                return acc;
            }, [])
            .join('\n\n');

        // Get previous messages from cache, excluding current session
        let prevMessages = '';
        for (const [sessionId, session] of this.sessionCache) {
            if (sessionId !== currentSessionId) {
                const formattedMessages = session.messages
                    .reduce((acc: string[], msg, idx) => {
                        if (msg.role === 'user') {
                            acc.push(`${msg.role}: ${msg.body}`);
                        } else {
                            // Append assistant's message
                            acc[acc.length - 1] += `\n${msg.role}: ${msg.body}`;
                        }
                        return acc;
                    }, [])
                    .join('\n\n');
                prevMessages += (prevMessages ? '\n\n' : '') + formattedMessages;
            }
        }

        return { currentMessages, prevMessages };
    }

    private async resolveFacts(fact: any, existingEdges: any[]): Promise<any> {
        // Use the RESOLVE_FACTS task to check if the extracted fact is a duplicate of any existing edges
        const resolveFactsResult = await this.processWithLLM(
            GraphTask.RESOLVE_FACTS,
            {
                new_edge: fact,
                existing_edges: existingEdges
            }
        );

        return resolveFactsResult;
    }

    private log(message: string, data: any) {
        console.log(message, data);
    }

    private updateSessionCache(messages: Array<{
        id: string,
        body: string,
        role: string,
        timestamp: Date,
        sessionId: string
    }>): void {
        const sessionId = messages[0].sessionId;

        // Update or add current session
        this.sessionCache.set(sessionId, {
            messages,
            lastAccessed: new Date()
        });

        // If cache exceeds max size, remove oldest accessed session
        if (this.sessionCache.size > this.MAX_SESSION_CACHE) {
            let oldestSession: string | null = null;
            let oldestAccess: Date | null = null;

            for (const [sid, session] of this.sessionCache) {
                if (!oldestAccess || session.lastAccessed < oldestAccess) {
                    oldestSession = sid;
                    oldestAccess = session.lastAccessed;
                }
            }

            if (oldestSession) {
                this.sessionCache.delete(oldestSession);
            }
        }
    }
}
