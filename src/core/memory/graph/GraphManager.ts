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
import crypto from 'crypto';

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
    private entities: Map<string, any> = new Map();

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
        // Layer 1: Create episode nodes
        await this.createEpisodeNodes(messages);

        if (processingLayer > 1) {
            // Layer 2: Process semantic layer
            // Get context from previous messages
            const { currentMessages, prevMessages } = await this.prepareMessageContext(messages);

            // Process entities with deduplication
            const resolvedEntities = await this.processEntities(currentMessages, prevMessages);

            // Process temporal relationships
            const temporalResult = await this.processTemporalRelationships(
                currentMessages, 
                prevMessages, 
                messages[0].timestamp
            );

            // Create graph nodes and edges
            await this.createGraphStructures(resolvedEntities, temporalResult, messages[0]);
        }

        if (processingLayer > 2) {
            // Layer 3: Process community layer
            await this.refineCommunities(messages[0].sessionId);
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
        return this.graph.query(filter);
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
        const llmStartTime = Date.now();
        const result = await this.llm.process(task, data);
        const llmEndTime = Date.now();
        console.log(`LLM processing took: ${llmEndTime - llmStartTime}ms`);
        return result;
    }

    private async updateCommunityMembers(communityId: string, members: string[]): Promise<void> {
        // Update community members in the graph
        // This implementation is omitted for brevity
    }

    private log(message: string, data: any) {
        console.log(message, data);
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
            const episodeNode: IGraphNode<EpisodeContent> = {
                id: `ep_${message.id}`,
                type: 'episode',
                content: {
                    body: message.body,
                    timestamp: message.timestamp,
                    source: message.role,
                    sourceDescription: message.body,
                    sessionId: message.sessionId
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
        // Get previous context (last 4 messages)
        const { nodes: allNodes } = await this.graph.query({ nodeTypes: ['episode'] });
        const prevNodes = allNodes.sort((a, b) => 
            (b.validAt?.getTime() || 0) - (a.validAt?.getTime() || 0)
        );

        this.log('All Nodes After Sort:', allNodes.map(node => ({ id: node.id, validAt: node.validAt })));

        const prevMessages = prevNodes
            .slice(0, 4)
            .filter(node => !messages.some(msg => msg.id === node.metadata.get('turnId')))
            .map(node => `${node.content.source}: ${node.content.body}`)
            .join('\n');

        const currentMessages = messages
            .map(msg => `${msg.role}: ${msg.body}`)
            .join('\n');

        this.log('Previous Messages:', prevMessages);
        return { currentMessages, prevMessages };
    }

    private async processEntities(
        currentMessages: string,
        prevMessages: string
    ): Promise<Array<any>> {
        // Extract entities using LLM
        const extractionResult = await this.processWithLLM(
            GraphTask.EXTRACT_ENTITIES,
            {
                text: currentMessages,
                context: prevMessages
            }
        );

        const extractedEntities = extractionResult.entities;

        // Deduplicate entities
        await this.deduplicateEntities(extractedEntities, prevMessages);

        return extractedEntities;
    }

    private async deduplicateEntities(entities: any[], prevMessages: string): Promise<void> {
        if (!this.embedder) {
            throw new Error('Embedder is not initialized');
        }

        const startTime = Date.now();

        // Get embeddings for all entity names at once
        const embeddingsStartTime = Date.now();
        const embeddings = await Promise.all(entities.map(entity => this.embedder!.generateEmbeddings(entity.name)));
        const embeddingsEndTime = Date.now();
        console.log(`Embeddings generation took: ${embeddingsEndTime - embeddingsStartTime}ms`);

        // Find similar entities for all entities at once
        const searchStartTime = Date.now();
        const similarEntitiesPromises = entities.map((entity, i) => 
            this._hybridSearch.searchWithTemporal(entity.name, embeddings[i][0])
        );
        const similarEntitiesResults = await Promise.all(similarEntitiesPromises);
        const searchEndTime = Date.now();
        console.log(`Hybrid search took: ${searchEndTime - searchStartTime}ms`);

        // Prepare data for bulk deduplication
        const dedupeData = entities.map((entity, i) => {
            const similarEntities = similarEntitiesResults[i];
            const entityId = this.generateEntityId(entity.name, entity.type);
            return {
                newEntity: {
                    id: entityId,
                    name: entity.name,
                    type: entity.type,
                    summary: entity.summary
                },
                existingNodes: similarEntities
            };
        });

        // Perform bulk deduplication using LLM
        const dedupeResult = await this.processWithLLM(
            GraphTask.DEDUPE_NODES,
            {
                entities: dedupeData,
                context: prevMessages
            }
        );

        // Process deduplication results
        for (let i = 0; i < entities.length; i++) {
            const entity = entities[i];
            const entityId = this.generateEntityId(entity.name, entity.type);
            const dedupeInfo = dedupeResult.results[i];

            if (dedupeInfo.isDuplicate && dedupeInfo.duplicateOf) {
                // Merge with existing entity
                const existingEntity = this.entities.get(dedupeInfo.duplicateOf);
                if (existingEntity) {
                    // Merge entity data
                    const mergedEntity = {
                        ...existingEntity,
                        name: entity.name || existingEntity.name,
                        summary: entity.summary || existingEntity.summary,
                        // Preserve any additional content fields
                        ...(existingEntity.content || {})
                    };

                    // Update entity in registry
                    this.entities.set(entityId, mergedEntity);

                    // Update entity node in graph
                    const existingNode = await this.storage.getNode(entityId);
                    if (existingNode) {
                        const updatedNode: IGraphNode = {
                            ...existingNode,
                            content: mergedEntity,
                            metadata: new Map([
                                ...existingNode.metadata,
                                ['lastUpdateTime', new Date().toISOString()]
                            ])
                        };
                        await this.storage.updateNode(entityId, updatedNode);
                    }
                }
            } else {
                // Add as new entity if not already exists
                if (!this.entities.has(entityId)) {
                    this.entities.set(entityId, entity);
                    await this.storage.addNode({
                        id: entityId,
                        type: 'entity',
                        content: entity,
                        metadata: new Map([
                            ['createdAt', new Date().toISOString()],
                            ['type', entity.type]
                        ]),
                        createdAt: new Date(),
                        validAt: new Date()
                    });
                }
            }
        }

        const endTime = Date.now();
        console.log(`Entity deduplication took: ${endTime - startTime}ms`);
    }

    private generateEntityId(name: string, entityType: string): string {
        const uniqueString = `${name.toLowerCase().trim()}|${entityType.toLowerCase()}`;
        return crypto.createHash('md5').update(uniqueString).digest('hex');
    }

    private async processTemporalRelationships(
        currentMessages: string,
        prevMessages: string,
        timestamp: Date
    ): Promise<any> {
        const result = await this.processWithLLM(
            GraphTask.EXTRACT_TEMPORAL,
            {
                text: currentMessages,
                context: prevMessages || undefined,
                metadata: { timestamp }
            }
        );
        this.log('Temporal Result:', result);
        return result;
    }

    private async createGraphStructures(
        resolvedEntities: Array<any>,
        temporalResult: any,
        firstMessage: {
            timestamp: Date,
            sessionId: string
        }
    ): Promise<void> {
        // Helper to ensure entity ID has prefix
        const ensureEntityPrefix = (id: string | number) => {
            const strId = String(id);
            return strId.startsWith('entity_') ? strId : `entity_${strId}`;
        };

        // Create or update entity nodes
        const createdEntityIds = new Set<string>();
        const temporalEntities = temporalResult?.entities || [];
        if (Array.isArray(temporalEntities)) {
            for (const entity of temporalEntities) { 
                const entityId = ensureEntityPrefix(entity.id);
                const entityType = entity.type.toLowerCase();
                
                // Get existing node if any
                const existingNode = await this.storage.getNode(entityId);
                
                // Prepare node data, preserving existing metadata if present
                const entityNode: IGraphNode = {
                    id: entityId,
                    type: entityType,
                    content: {
                        name: entity.name || '',
                        summary: entity.summary || '',
                        // Preserve any additional content fields
                        ...(existingNode?.content || {})
                    },
                    metadata: new Map([
                        // Preserve existing metadata
                        ...(existingNode?.metadata || []),
                        // Update with new metadata
                        ['sessionId', firstMessage.sessionId],
                        ['timestamp', firstMessage.timestamp.toISOString()],
                        ['entityType', entityType],
                        ['lastUpdateTime', new Date().toISOString()]
                    ]),
                    createdAt: existingNode?.createdAt || new Date(),
                    validAt: firstMessage.timestamp,
                    // Don't include invalidAt for nodes
                    expiredAt: existingNode?.expiredAt
                };

                if (existingNode) {
                    // Update existing node
                    await this.storage.updateNode(entityId, entityNode);
                    this.log('Updated entity node:', { 
                        entityId, 
                        type: entityType,
                        name: entity.name
                    });
                } else {
                    // Create new node
                    await this.storage.addNode(entityNode);
                    this.log('Created entity node:', { 
                        entityId, 
                        type: entityType,
                        name: entity.name
                    });
                }
                createdEntityIds.add(entityId);
            }
        }

        // Create or update relationships
        if (temporalResult?.relationships && Array.isArray(temporalResult.relationships)) {
            for (const rel of temporalResult.relationships) {
                try {
                    const sourceId = ensureEntityPrefix(rel.sourceId);
                    const targetId = ensureEntityPrefix(rel.targetId);
                    
                    // Verify both nodes exist
                    const [sourceExists, targetExists] = await Promise.all([
                        this.storage.getNode(sourceId),
                        this.storage.getNode(targetId)
                    ]);
                    
                    if (!sourceExists || !targetExists) {
                        console.error('Cannot create relationship - missing nodes:', {
                            sourceId,
                            targetId,
                            relationship: rel.type
                        });
                        continue;
                    }

                    const relationshipId = `rel_${sourceId}_${targetId}_${rel.type}`;
                    const validAt = rel.valid_at ? new Date(rel.valid_at) : firstMessage.timestamp;
                    const invalidAt = rel.invalid_at ? new Date(rel.invalid_at) : undefined;

                    // Get existing relationship if any
                    const existingEdge = await this.storage.getEdge(relationshipId);

                    const relationshipEdge: IGraphEdge = {
                        id: relationshipId,
                        type: rel.type.toLowerCase(),
                        sourceId,
                        targetId,
                        content: {
                            name: rel.name,
                            description: rel.description
                        },
                        metadata: new Map([
                            ['temporalStage', 'processed'],
                            ['sessionId', firstMessage.sessionId],
                            ['timestamp', firstMessage.timestamp.toISOString()]
                        ]),
                        createdAt: existingEdge?.createdAt || new Date(),
                        validAt,
                        invalidAt,
                        expiredAt: existingEdge?.expiredAt
                    };

                    if (existingEdge) {
                        // Update existing relationship
                        await this.storage.updateEdge(relationshipId, relationshipEdge);
                        this.log('Updated relationship:', { 
                            id: relationshipId, 
                            type: rel.type,
                            source: sourceId,
                            target: targetId
                        });
                    } else {
                        // Create new relationship
                        await this.storage.addEdge(relationshipEdge);
                        this.log('Created relationship:', { 
                            id: relationshipId, 
                            type: rel.type,
                            source: sourceId,
                            target: targetId
                        });
                    }
                } catch (error) {
                    console.error('Failed to add/update relationship:', error);
                }
            }
        }
    }

    private async processMessageBatch(messages: Array<{
        id: string,
        body: string,
        role: string,
        timestamp: Date,
        sessionId: string
    }>): Promise<void> {
        try {
            // Stage 1: Initial entity extraction
            const extractedNodeIds = await this.processEntityExtraction(messages);
            this.log('Stage 1: Extracted entities', { count: extractedNodeIds.length });

            // Stage 2: Entity deduplication
            const deduplicatedNodeIds = await this.processEntityDeduplication(extractedNodeIds, messages[0].body);
            this.log('Stage 2: Deduplicated entities', { count: deduplicatedNodeIds.length });

            // Stage 3: Temporal relationship extraction
            await this.processTemporalStage(deduplicatedNodeIds, {
                timestamp: messages[0].timestamp,
                sessionId: messages[0].sessionId
            });
            this.log('Stage 3: Processed temporal relationships', { nodeCount: deduplicatedNodeIds.length });
        } catch (error) {
            console.error('Failed to process message batch:', error);
            throw error;
        }
    }

    /**
     * Stage 1: Extract entities and store them with initial metadata
     */
    private async processEntityExtraction(messages: Array<{
        body: string,
        timestamp: Date,
        sessionId: string
    }>): Promise<string[]> {
        const processStartTime = Date.now();

        const extractedNodeIds: string[] = [];
        const currentMessages = messages.map(m => m.body).join('\n');

        // Extract entities using LLM
        const extractEntitiesStartTime = Date.now();
        const entities = await this.processWithLLM(
            GraphTask.EXTRACT_ENTITIES,
            {
                messages: currentMessages
            }
        );
        const extractEntitiesEndTime = Date.now();
        console.log(`Entity extraction took: ${extractEntitiesEndTime - extractEntitiesStartTime}ms`);
        this.log('Extracted Entities:', entities);

        // Store each entity
        for (const entity of entities?.entities || []) { 
            const entityId = this.generateEntityId(entity.name, entity.type);
            entity.id = entityId;

            try {
                const entityNode: IGraphNode = {
                    id: entityId,
                    type: entity.type.toLowerCase(),
                    content: {
                        name: entity.name,
                        summary: entity.summary
                    },
                    metadata: new Map([
                        ['extractionStage', 'initial'],
                        ['sessionId', messages[0].sessionId],
                        ['timestamp', messages[0].timestamp.toISOString()]
                    ]),
                    createdAt: new Date(),
                    validAt: messages[0].timestamp
                };

                await this.addNode(entityNode);
                extractedNodeIds.push(entityId);
                this.log('Stored initial entity:', { entityId, type: entity.type });
            } catch (error) {
                console.error('Failed to store entity:', error);
            }
        }

        const processEndTime = Date.now();
        console.log(`Entity extraction process took: ${processEndTime - processStartTime}ms`);
        return extractedNodeIds;
    }

    /**
     * Stage 2: Deduplicate entities and update storage with merged data
     */
    private async processEntityDeduplication(nodeIds: string[], prevMessages: string): Promise<string[]> {
        const processStartTime = Date.now();

        const deduplicatedIds: string[] = [];
        const nodes = await Promise.all(nodeIds.map(id => this.storage.getNode(id)));
        const validNodes = nodes.filter((n): n is NonNullable<typeof n> => n !== null);

        // Get deduplication results from LLM
        const llmStartTime = Date.now();
        const dedupeResult = await this.processWithLLM(
            GraphTask.DEDUPE_NODES,
            {
                entities: validNodes,
                context: prevMessages
            }
        );
        const llmEndTime = Date.now();
        console.log(`LLM deduplication took: ${llmEndTime - llmStartTime}ms`);

        // Process each merged entity
        for (const mergedEntity of dedupeResult.entities) {
            try {
                const primaryId = `entity_${mergedEntity.primaryId}`;
                const duplicateIds = mergedEntity.duplicateIds.map((id: string) => `entity_${id}`);

                // Create merged node
                const mergedNode: IGraphNode = {
                    id: primaryId,
                    type: mergedEntity.type.toLowerCase(),
                    content: {
                        name: mergedEntity.name,
                        summary: mergedEntity.summary,
                        alternateNames: mergedEntity.alternateNames || []
                    },
                    metadata: new Map([
                        ['deduplicationStage', 'merged'],
                        ['mergedIds', duplicateIds],
                        ['lastUpdateTime', new Date().toISOString()]
                    ]),
                    createdAt: new Date(),
                    validAt: new Date()
                };

                // Update primary node
                await this.storage.updateNode(primaryId, mergedNode);
                deduplicatedIds.push(primaryId);

                // Mark duplicates as merged
                for (const dupId of duplicateIds) {
                    if (dupId !== primaryId) {
                        const dupNode = await this.storage.getNode(dupId);
                        if (dupNode) {
                            dupNode.metadata.set('mergedInto', primaryId);
                            dupNode.metadata.set('lastUpdateTime', new Date().toISOString());
                            await this.storage.updateNode(dupId, dupNode);
                        }
                    }
                }

                this.log('Merged entities:', { primaryId, duplicateIds });
            } catch (error) {
                console.error('Failed to merge entities:', error);
            }
        }

        const processEndTime = Date.now();
        console.log(`Entity deduplication process took: ${processEndTime - processStartTime}ms`);
        return deduplicatedIds;
    }

    /**
     * Stage 3: Extract and store temporal relationships
     */
    private async processTemporalStage(nodeIds: string[], firstMessage: {
        timestamp: Date,
        sessionId: string
    }): Promise<void> {
        const processStartTime = Date.now();

        // Get all deduplicated nodes
        const nodes = await Promise.all(nodeIds.map(id => this.storage.getNode(id)));
        const validNodes = nodes.filter((n): n is NonNullable<typeof n> => n !== null);

        // Extract temporal relationships
        const temporalResult = await this.processWithLLM(GraphTask.EXTRACT_TEMPORAL, {
            nodes: validNodes,
            metadata: {
                timestamp: firstMessage.timestamp,
                sessionId: firstMessage.sessionId
            }
        });

        // Update nodes with temporal data
        if (temporalResult.entities) {
            for (const entity of temporalResult.entities) {
                try {
                    const entityId = `entity_${entity.id}`;
                    const existingNode = await this.storage.getNode(entityId);
                    if (existingNode) {
                        // Merge temporal metadata
                        const updatedNode: IGraphNode = {
                            ...existingNode,
                            metadata: new Map([
                                ...existingNode.metadata,
                                ['temporalStage', 'processed'],
                                ['lastUpdateTime', new Date().toISOString()]
                            ])
                        };
                        await this.storage.updateNode(entityId, updatedNode);
                    }
                } catch (error) {
                    console.error('Failed to update temporal entity data:', error);
                }
            }
        }

        // Create temporal relationships
        if (temporalResult.relationships) {
            for (const rel of temporalResult.relationships) {
                try {
                    const sourceId = `entity_${rel.sourceId}`;
                    const targetId = `entity_${rel.targetId}`;
                    
                    // Verify both nodes exist
                    const [sourceExists, targetExists] = await Promise.all([
                        this.storage.getNode(sourceId),
                        this.storage.getNode(targetId)
                    ]);
                    
                    if (!sourceExists || !targetExists) {
                        console.error('Cannot create relationship - missing nodes:', {
                            sourceId,
                            targetId,
                            relationship: rel.type
                        });
                        continue;
                    }

                    const relationshipId = `rel_${sourceId}_${targetId}_${rel.type}`;
                    const edge: IGraphEdge = {
                        id: relationshipId,
                        type: rel.type.toLowerCase(),
                        sourceId,
                        targetId,
                        content: {
                            name: rel.name,
                            description: rel.description
                        },
                        metadata: new Map([
                            ['temporalStage', 'processed'],
                            ['sessionId', firstMessage.sessionId],
                            ['timestamp', firstMessage.timestamp.toISOString()]
                        ]),
                        createdAt: new Date(),
                        validAt: rel.valid_at ? new Date(rel.valid_at) : firstMessage.timestamp,
                        invalidAt: rel.invalid_at ? new Date(rel.invalid_at) : undefined
                    };

                    await this.storage.addEdge(edge);
                    this.log('Created temporal relationship:', {
                        id: relationshipId,
                        type: rel.type,
                        source: sourceId,
                        target: targetId
                    });
                } catch (error) {
                    console.error('Failed to create temporal relationship:', error);
                }
            }
        }

        const processEndTime = Date.now();
        console.log(`Temporal relationship extraction process took: ${processEndTime - processStartTime}ms`);
    }
}
