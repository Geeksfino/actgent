import { OpenAI } from 'openai';
import {
    IGraphNode,
    IGraphEdge,
    GraphFilter,
    MemoryType,
    EpisodeContent,
    EntityContent,
    EntityMentionContent,
    ExperienceContent,
    IGraphMemoryUnit,
    TemporalMode,
    isEpisodeNode,
    TraversalOptions,
    IGraphStorage,
    IGraphIndex
} from './data/types';
import { InMemoryGraphStorage } from './data/InMemoryGraphStorage';
import { InMemoryGraphIndex } from './data/InMemoryGraphIndex';
import { MemoryGraph } from './data/operations';
import { EpisodicGraphProcessor } from './processing/episodic/processor';
import { IEmbedder, EmbedderProvider } from './embedder/types';
import { EmbedderFactory } from './embedder/factory';
import crypto from 'crypto';
import { IdGenerator } from './id/IdGenerator';
import { DeterministicIdGenerator } from './id/DeterministicIdGenerator';
import { SemanticGraphProcessor } from './processing/semantic/processor';
import { GraphTask, LLMConfig } from './types';
import { TemporalHybridSearch } from './query/hybrid';
import { EmbeddingSearch } from './query/embedding';
import { BM25Search } from './query/bm25';
import { ResultReranker } from './query/reranking';

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

interface EntityExtractionResult {
    entities: Array<{
        id: number;
        mention: string;
        type: string;
        span: {
            start: number;
            end: number;
        };
        confidence: number;
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
     * Ingest messages into the graph memory system:
     * - Creating episode nodes
     * - Extracting entities and relationships using LLM
     * - Building graph connections
     * - Automatic community refinement
     * @param messages Array of messages to ingest
     * @param processingLayer Optional, controls depth of processing:
     *   1 = episodic only
     *   2 = episodic + semantic
     *   3 = episodic + semantic + community (default)
     */
    async ingest(messages: Array<{
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
            episodeId: messages[0].id // Pass the episodeId to track the source
        });
        console.log("extractionResult.entities:", JSON.stringify(extractionResult.entities, null, 2));
        // Process temporal relationships in Layer 1
        // const temporalResult = await this.processTemporalRelationships(
        //     currentMessages, 
        //     prevMessages, 
        //     messages[0].timestamp
        // );

        // Store raw mentions with temporal metadata
        const extractedMentions = [];
        for (const entity of extractionResult.entities) {
            const node: Partial<IGraphNode> = {
                type: entity.type.toUpperCase(),
                content: {
                    mention: entity.mention,
                    span: entity.span,
                    entityType: entity.type,  // Include the entity type
                    confidence: entity.confidence  // Include confidence score
                },
                metadata: new Map([
                    ['sessionId', messages[0].sessionId],
                    ['timestamp', messages[0].timestamp.toISOString()],
                    ['episodeId', messages[0].id]  // Include episode ID
                ]),
                createdAt: new Date(),
                validAt: messages[0].timestamp,
                edges: []
            };

            const mentionId = this.idGenerator.generateNodeId(node);
            node.id = mentionId;
            await this.storage.addNode(node as IGraphNode);

            extractedMentions.push({
                ...entity,
                id: mentionId
            });
        }

        // Create temporal relationships between mentions
        // if (temporalResult.relationships) {
        //     for (const rel of temporalResult.relationships) {
        //         const sourceMention = extractedMentions.find(m => m.id === rel.sourceId);
        //         const targetMention = extractedMentions.find(m => m.id === rel.targetId);
                
        //         if (sourceMention && targetMention) {
        //             const edge: Partial<IGraphEdge> = {
        //                 type: rel.type,
        //                 sourceId: sourceMention.id,
        //                 targetId: targetMention.id,
        //                 content: {
        //                     episode_id: messages[0].id,
        //                     confidence: rel.confidence
        //                 },
        //                 metadata: new Map([
        //                     ['confidence', rel.confidence.toString()],
        //                     ['temporalContext', JSON.stringify({
        //                         ...rel.temporalContext,
        //                         timestamp: messages[0].timestamp.toISOString()
        //                     })]
        //                 ]),
        //                 createdAt: new Date(),
        //                 validAt: messages[0].timestamp
        //             };

        //             edge.id = this.idGenerator.generateEdgeId(edge);
        //             await this.storage.addEdge(edge as IGraphEdge);
        //         }
        //     }
        // }

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
    async getSnapshot(filter: GraphFilter & { sessionId?: string }): Promise<{ nodes: IGraphNode[], edges: IGraphEdge[] }> {
        console.log('Getting snapshot with filter:', filter);
        const result = await this.storage.query(filter);
        console.log('Snapshot query result:', {
            nodeCount: result.nodes.length,
            nodeTypes: new Set(result.nodes.map(n => n.type)),
            nodes: result.nodes.map(n => ({
                id: n.id,
                type: n.type,
                name: n.content?.name
            }))
        });
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
        // Get previous nodes
        const { nodes: prevNodes } = await this.graph.query({ nodeTypes: ['episode'] });
        const allNodes = [...prevNodes].sort((a, b) => 
            (a.validAt?.getTime() || 0) - (b.validAt?.getTime() || 0)
        );

        this.log('All Nodes After Sort:', allNodes.map(node => ({ id: node.id, validAt: node.validAt })));

        const prevMessages = prevNodes
            .slice(0, 4)
            .filter((node: IGraphNode) => !messages.some(msg => msg.id === node.metadata.get('turnId')))
            .map((node: IGraphNode) => `${node.content.actor}: ${node.content.content}`)
            .join('\n');

        // Group messages into turns (user + assistant pairs)
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

        this.log('Previous Messages:', prevMessages);
        return { currentMessages, prevMessages };
    }

    /**
     * Process a task using LLM with proper data handling
     */
    private async processTemporalRelationships(
        currentMessages: string,
        prevMessages: string,
        timestamp: Date
    ): Promise<any> {
        interface TemporalResult {
            entities?: Array<{
                id: number;
                type: string;
                mention: string;
                confidence: number;
                turn?: number;
            }>;
            relationships?: Array<{
                sourceId: number;
                targetId: number;
                type: string;
                confidence: number;
                turn?: number;
                temporalContext?: {
                    timestamp: string;
                    type: string;
                };
            }>;
        }

        // Extract temporal information about entities and relationships
        const temporalResult = await this.llm.process<TemporalResult>(GraphTask.EXTRACT_TEMPORAL, {
            text: currentMessages,
            context: prevMessages,
            referenceTimestamp: timestamp.toISOString()
        });

        console.log("=== Processing Temporal Relationships ===");
        console.log("Raw entities from LLM:", JSON.stringify(temporalResult.entities, null, 2));

        if (temporalResult.entities) {
            // Deduplicate entities within the same turn
            const uniqueEntities = temporalResult.entities.reduce((acc, entity) => {
                const key = `${entity.turn}:${entity.type}:${entity.mention}`;
                if (!acc.has(key)) {
                    acc.set(key, entity);
                }
                return acc;
            }, new Map<string, any>()).values();

            temporalResult.entities = Array.from(uniqueEntities);
        }

        // Create mention nodes for each entity, deduplicating within turns
        const entityIdMap = new Map<number, string>(); // Map LLM entity IDs to node IDs
        const mentionMap = new Map<string, {
            type: string;
            mention: string;
            confidence: number;
            turn: number;
            ids: number[]
        }>();

        // First pass: identify all unique mentions per turn
        console.log("\n=== First Pass: Grouping Mentions ===");
        // Group mentions by turn and text
        for (const entity of temporalResult.entities || []) {
            const turn = entity.turn || 0;
            const mentionKey = `${turn}:${entity.type}:${entity.mention}`;
            console.log(`\nProcessing entity: ${entity.mention} (turn ${turn})`);
            console.log(`Generated mention key: ${mentionKey}`);
            
            const existing = mentionMap.get(mentionKey);
            if (existing) {
                console.log(`Found existing mention for key ${mentionKey}`);
                console.log(`Existing ids: [${existing.ids}], adding id: ${entity.id}`);
                // If this mention already exists in this turn, just add the ID to the list
                existing.ids.push(entity.id);
                // Keep the highest confidence if we see multiple instances
                if (entity.confidence > existing.confidence) {
                    console.log(`Updating confidence from ${existing.confidence} to ${entity.confidence}`);
                    existing.confidence = entity.confidence;
                }
            } else {
                console.log(`Creating new mention entry for key ${mentionKey}`);
                // First time seeing this mention in this turn
                mentionMap.set(mentionKey, {
                    type: entity.type,
                    mention: entity.mention,
                    confidence: entity.confidence,
                    turn: turn,
                    ids: [entity.id]
                });
            }
        }

        console.log("\n=== Second Pass: Creating Nodes ===");
        console.log("Unique mentions:", Array.from(mentionMap.entries()));

        // Create nodes for unique mentions
        for (const [mentionKey, mentionData] of mentionMap.entries()) {
            console.log(`Creating node for mentionKey: ${mentionKey}`);
             // Create a node for this unique mention in this turn
             const node: Partial<IGraphNode> = {
                type: mentionData.type,
                content: {
                    mention: mentionData.mention,
                    turn: mentionData.turn
                },
                metadata: new Map([
                    ['turn', mentionData.turn.toString()],
                    ['timestamp', timestamp.toISOString()]
                ]),
                createdAt: new Date(),
                validAt: timestamp,
                edges: []
            };

            const nodeId = this.idGenerator.generateNodeId(node);
            node.id = nodeId;

            await this.storage.addNode(node as IGraphNode);
            console.log(`Created node: ${nodeId} for mention "${mentionData.mention}" in turn ${mentionData.turn}`);

            // Map all entity IDs for this mention to the same node
            for (const entityId of mentionData.ids) {
                entityIdMap.set(entityId, nodeId);
            }
        }

        // Process relationships using the mapped node IDs
        if (temporalResult.relationships) {
            console.log("\n=== Processing Relationships ===");
            for (const rel of temporalResult.relationships) {
                console.log(`\nProcessing relationship: ${rel.type}`);
                console.log(`Source ID: ${rel.sourceId}, Target ID: ${rel.targetId}`);
                
                const sourceNodeId = entityIdMap.get(rel.sourceId);
                const targetNodeId = entityIdMap.get(rel.targetId);

                console.log(`Mapped to nodes: source=${sourceNodeId}, target=${targetNodeId}`);

                if (!sourceNodeId || !targetNodeId) {
                    console.error(`Missing node mapping for relationship: source=${rel.sourceId}, target=${rel.targetId}`);
                    continue;
                }

                let validAt = timestamp;
                if (rel.temporalContext?.timestamp) {
                    if (rel.temporalContext.timestamp === 'CURRENT_TIMESTAMP') {
                        validAt = timestamp;
                    } else {
                        try {
                            validAt = new Date(rel.temporalContext.timestamp);
                        } catch (e) {
                            console.error(`Invalid timestamp format: ${rel.temporalContext.timestamp}`);
                            validAt = timestamp;
                        }
                    }
                }

                const edge: Partial<IGraphEdge> = {
                    type: rel.type,
                    sourceId: sourceNodeId,
                    targetId: targetNodeId,
                    content: {
                        confidence: rel.confidence,
                        turn: rel.turn || 0
                    },
                    metadata: new Map([
                        ['turn', (rel.turn || 0).toString()],
                        ['timestamp', validAt.toISOString()]
                    ]),
                    createdAt: new Date(), // T' timeline - when we created this edge
                    validAt: validAt, // Always use conversation timestamp
                    expiredAt: undefined // No expiration for now
                };

                const edgeId = this.idGenerator.generateEdgeId(edge);
                edge.id = edgeId;
                await this.storage.addEdge(edge as IGraphEdge);
                console.log(`Created edge: ${edgeId} of type ${rel.type}`);
            }
        }

        return temporalResult;
    }

    private async createGraphStructures(
        resolvedEntities: Array<any>,
        temporalResult: any,
        firstMessage: {
            timestamp: Date,
            sessionId: string
        }
    ): Promise<void> {
        const temporalEntities = temporalResult.entities || [];
        const createdMentionIds = new Map<string, string>();

        // Create mention nodes for temporal entities
        if (Array.isArray(temporalEntities)) {
            for (const entity of temporalEntities) {
                // Create mention node with generated ID
                const mentionNode: Partial<IGraphNode> = {
                    type: 'mention',
                    content: {
                        text: entity.mention,
                        entityType: entity.type
                    },
                    metadata: new Map([
                        ['sessionId', firstMessage.sessionId],
                        ['timestamp', firstMessage.timestamp.toISOString()]
                    ]),
                    createdAt: new Date(),
                    validAt: firstMessage.timestamp,
                    edges: []
                };

                const mentionId = this.idGenerator.generateNodeId(mentionNode);
                mentionNode.id = mentionId;

                await this.storage.addNode(mentionNode as IGraphNode);
                createdMentionIds.set(entity.mention, mentionId);

                // Create episode node if it doesn't exist
                const episodeNode: Partial<IGraphNode> = {
                    type: 'episode',
                    content: {
                        type: 'message',
                        content: entity.context || '',
                        metadata: {
                            sessionId: firstMessage.sessionId,
                            timestamp: firstMessage.timestamp.toISOString()
                        }
                    }
                };
                const episodeId = this.idGenerator.generateNodeId(episodeNode);
                episodeNode.id = episodeId;
                await this.storage.addNode(episodeNode as IGraphNode);

                // Link mention to episode
                const mentionToEpisodeEdge: Partial<IGraphEdge> = {
                    type: 'MENTIONED_IN',
                    sourceId: mentionId,
                    targetId: episodeId,
                    content: {
                        type: 'MENTIONED_IN',
                        description: `Mention in episode ${entity.context}`
                    },
                    metadata: new Map(),
                    createdAt: new Date(),
                    validAt: firstMessage.timestamp
                };

                const edgeId = this.idGenerator.generateEdgeId(mentionToEpisodeEdge);
                mentionToEpisodeEdge.id = edgeId;
                await this.storage.addEdge(mentionToEpisodeEdge as IGraphEdge);

                this.log('Created mention node and edge:', { 
                    mentionId: mentionNode.id,
                    episodeId,
                    type: entity.type
                });
            }
        }

        // Create temporal relationships between mentions
        if (temporalResult.relationships) {
            for (const rel of temporalResult.relationships) {
                const sourceMentionId = createdMentionIds.get(rel.sourceName);
                const targetMentionId = createdMentionIds.get(rel.targetName);

                if (sourceMentionId && targetMentionId) {
                    const edge: Partial<IGraphEdge> = {
                        type: rel.type,
                        sourceId: sourceMentionId,
                        targetId: targetMentionId,
                        content: {
                            type: rel.type,
                            description: `Temporal relationship between ${rel.sourceName} and ${rel.targetName}`
                        },
                        metadata: new Map([
                            ['confidence', rel.confidence.toString()],
                            ['episode_id', rel.episode_id || '']
                        ]),
                        createdAt: new Date(), // T' timeline - when we created this edge
                        validAt: firstMessage.timestamp, // Always use conversation timestamp
                        expiredAt: undefined // No expiration for now
                    };

                    const edgeId = this.idGenerator.generateEdgeId(edge);
                    edge.id = edgeId;
                    await this.storage.addEdge(edge as IGraphEdge);

                    this.log('Created relationship:', {
                        sourceId: sourceMentionId,
                        targetId: targetMentionId,
                        type: rel.type
                    });
                }
            }
        }
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
}
