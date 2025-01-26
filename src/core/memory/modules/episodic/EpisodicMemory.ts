import { 
    MemoryType,
    MemoryFilter,
    IMemoryUnit
} from '../../base';
import { DeclarativeMemory } from '../../DeclarativeMemory';
import { IMemoryStorage, IMemoryIndex, IGraphStorage, IGraphIndex } from '../../storage';
import { IEpisodicMemoryUnit } from './types';
import { GraphOperations } from '../../graph/operations';
import { IGraphNode, IGraphEdge, GraphFilter } from '../../graph/types';
import { GraphLLMProcessor } from '../../graph/llm/processor';
import crypto from 'crypto';

/**
 * Episodic memory implementation using graph-based storage
 */
export class EpisodicMemory extends DeclarativeMemory {
    protected graphOps: GraphOperations;
    protected llm: GraphLLMProcessor;
    protected storage: IGraphStorage;
    protected index: IGraphIndex;

    constructor(storage: IGraphStorage, index: IGraphIndex, llmClient?: any) {
        super(storage, index, MemoryType.EPISODIC);
        this.storage = storage;
        this.index = index;
        this.llm = new GraphLLMProcessor(llmClient);
        this.graphOps = new GraphOperations(storage, this.llm);
    }

    /**
     * Create an episodic memory unit
     */
    public createMemoryUnit<C>(
        content: C | string, 
        schema?: any, 
        metadata?: Map<string, any>
    ): IEpisodicMemoryUnit {
        let validatedContent: any;
        const now = new Date();

        if (typeof content === 'string') {
            validatedContent = {
                timeSequence: Date.now(),
                location: metadata?.get('location') || 'unknown',
                actors: metadata?.get('actors') || [],
                actions: metadata?.get('actions') || [],
                emotions: metadata?.get('emotions') || {
                    currentEmotion: { valence: 0, arousal: 0 },
                    emotionalTrends: []
                },
                coherenceScore: metadata?.get('coherenceScore') || 1.0,
                emotionalIntensity: metadata?.get('emotionalIntensity') || 0.5,
                contextualRelevance: metadata?.get('contextualRelevance') || 1.0,
                temporalDistance: metadata?.get('temporalDistance') || 0,
                userInstruction: content,
                timestamp: now
            };
        } else {
            validatedContent = schema ? schema.parse(content) : content;
        }

        return {
            id: crypto.randomUUID(),
            content: validatedContent,
            metadata: metadata || new Map(),
            timestamp: now,
            memoryType: MemoryType.EPISODIC,
            createdAt: now,
            validAt: now
        };
    }

    /**
     * Construct an episodic memory unit
     */
    public constructMemoryUnit(content: any, metadata?: Map<string, any>): IEpisodicMemoryUnit {
        const metadataMap = new Map(metadata || []);
        // Add temporal metadata if not present
        if (!metadataMap.has('timestamp')) {
            metadataMap.set('timestamp', new Date());
        }
        return this.createMemoryUnit(content, undefined, metadataMap);
    }

    /**
     * Retrieve a memory by its ID
     */
    public async retrieve(id: string): Promise<IEpisodicMemoryUnit | null> {
        return await this.storage.retrieve(id) as IEpisodicMemoryUnit | null;
    }

    /**
     * Retrieve memories by filter
     */
    public async retrieveByFilter(filter: MemoryFilter): Promise<IEpisodicMemoryUnit[]> {
        const memories = await this.storage.retrieveByFilter(filter);
        return memories as IEpisodicMemoryUnit[];
    }

    /**
     * Find temporally related episodes
     */
    public async findTemporalContext(episodeId: string, contextSize: number = 4): Promise<IEpisodicMemoryUnit[]> {
        const episodes = await this.graphOps.getTemporalContext(episodeId, contextSize);
        return this.graphNodesToEpisodicUnits(episodes);
    }

    /**
     * Find episodes with similar emotional context
     */
    public async findEmotionallySimilar(emotions: any): Promise<IEpisodicMemoryUnit[]> {
        const filter = {
            type: 'episode',
            metadata: new Map<string, any>([['emotions', emotions]])
        };
        
        const episodes = await (this.storage as IGraphStorage).findNodes(filter);
        return this.graphNodesToEpisodicUnits(episodes);
    }

    /**
     * Find episodes involving specific actors
     */
    public async findByActors(actors: string[]): Promise<IEpisodicMemoryUnit[]> {
        const filter = {
            type: 'episode',
            metadata: new Map<string, any>([['actors', actors]])
        };
        
        const episodes = await (this.storage as IGraphStorage).findNodes(filter);
        return this.graphNodesToEpisodicUnits(episodes);
    }

    /**
     * Get related episodes based on shared context
     */
    public async getRelatedEpisodes(episodeId: string): Promise<IEpisodicMemoryUnit[]> {
        const episode = await this.retrieve(episodeId);
        if (!episode) return [];

        // Find episodes with shared actors or location
        const filter = {
            type: 'episode',
            metadata: new Map<string, any>([
                ['actors', episode.content.actors],
                ['location', episode.content.location]
            ])
        };

        const episodes = await (this.storage as IGraphStorage).findNodes(filter);
        return this.graphNodesToEpisodicUnits(episodes);
    }

    /**
     * Create a relationship between episodes
     */
    protected async linkEpisodes(sourceId: string, targetId: string, relationType: string): Promise<void> {
        const edge: IGraphEdge = {
            id: crypto.randomUUID(),
            type: relationType,
            sourceId: sourceId,
            targetId: targetId,
            metadata: new Map(),
            createdAt: new Date(),
            validAt: new Date(),
            episodeIds: [sourceId, targetId]  // Add required episodeIds
        };

        await (this.storage as IGraphStorage).addEdge(edge);
    }

    /**
     * Store an episodic memory unit
     */
    public async store(content: Omit<IEpisodicMemoryUnit, 'id' | 'timestamp' | 'memoryType'>): Promise<void> {
        const memoryUnit = this.createMemoryUnit(content.content, undefined, content.metadata);
        Object.assign(memoryUnit, content);
        await this.storage.store(memoryUnit);
    }

    /**
     * Update the emotional context of a memory
     */
    async updateEmotionalContext(memoryId: string, emotionalContext: any): Promise<void> {
        const memory = await this.retrieve(memoryId);
        if (!memory) {
            throw new Error(`Memory ${memoryId} not found`);
        }

        memory.content.emotions = emotionalContext;
        await this.store(memory);
    }

    /**
     * Consolidate memories based on various metrics
     */
    protected async consolidate(memories: IEpisodicMemoryUnit[]): Promise<void> {
        for (const memory of memories) {
            const consolidationScore = this.calculateConsolidationScore(memory);
            memory.metadata.set('consolidationScore', consolidationScore);
            await this.storage.update(memory);
        }
    }

    /**
     * Calculate consolidation score for a memory
     */
    private calculateConsolidationScore(memory: IEpisodicMemoryUnit): number {
        const emotionalContext = memory.content.emotions;
        const importance = memory.metadata.get('importance') as number || 0.5;
        
        // Calculate emotional intensity from emotional context
        const emotionalIntensity = Math.sqrt(
            Math.pow(emotionalContext.currentEmotion.valence, 2) + 
            Math.pow(emotionalContext.currentEmotion.arousal, 2)
        ) / Math.sqrt(2);

        return (emotionalIntensity + importance) / 2;
    }

    /**
     * Check if a memory unit is of episodic type
     */
    public isMemoryUnitOfType(unit: IMemoryUnit): unit is IEpisodicMemoryUnit {
        return unit.memoryType === MemoryType.EPISODIC &&
               'content' in unit &&
               this.isEpisodicContent(unit.content);
    }

    private isEpisodicContent(content: any): boolean {
        return content && 
               typeof content === 'object' &&
               'timeSequence' in content &&
               'location' in content &&
               'actors' in content &&
               'actions' in content;
    }

    /**
     * Add an episodic memory
     */
    async addEpisode(content: string, metadata?: Map<string, any>): Promise<string> {
        const now = new Date();
        const node: IGraphNode = {
            id: crypto.randomUUID(),
            type: 'episode',
            content,
            metadata: metadata || new Map(),
            timestamp: now,
            memoryType: MemoryType.EPISODIC,
            createdAt: now,
            validAt: now  // Episode's business time is when it was created
        };
        
        return this.storage.addNode(node);
    }

    /**
     * Add a relation between episodes
     */
    async addRelation(sourceId: string, targetId: string, relation: string): Promise<string> {
        const now = new Date();
        const edge: IGraphEdge = {
            id: crypto.randomUUID(),
            type: relation,
            sourceId: sourceId,
            targetId: targetId,
            metadata: new Map(),
            createdAt: now,
            validAt: now,
            episodeIds: [sourceId, targetId]
        };
        
        return this.storage.addEdge(edge);
    }

    /**
     * Find episodes in a given time range
     */
    protected async findEpisodesInRange(start: Date, end: Date): Promise<IEpisodicMemoryUnit[]> {
        const filter: GraphFilter = {
            nodeTypes: ['episode'],
            temporal: {
                validAfter: start,
                validBefore: end
            }
        };
        
        const nodes = await (this.storage as IGraphStorage).findNodes(filter);
        return this.graphNodesToEpisodicUnits(nodes);
    }

    /**
     * Find episodes by content
     */
    protected async findEpisodesByContent(query: string): Promise<IEpisodicMemoryUnit[]> {
        const nodes = await (this.storage as IGraphStorage).findNodes({
            nodeTypes: ['episode']
        });

        return this.graphNodesToEpisodicUnits(nodes);
    }

    /**
     * Find episodes by metadata
     */
    protected async findEpisodesByMetadata(metadata: Map<string, any>): Promise<IEpisodicMemoryUnit[]> {
        const nodes = await (this.storage as IGraphStorage).findNodes({
            nodeTypes: ['episode'],
            metadata
        });

        return this.graphNodesToEpisodicUnits(nodes);
    }

    /**
     * Find episodes by type
     */
    protected async findEpisodesByType(type: string): Promise<IEpisodicMemoryUnit[]> {
        const nodes = await (this.storage as IGraphStorage).findNodes({
            nodeTypes: ['episode']
        });

        return this.graphNodesToEpisodicUnits(nodes);
    }

    /**
     * Create an edge between nodes
     */
    protected async createEdge(sourceId: string, targetId: string, relation: string): Promise<void> {
        const edge: IGraphEdge = {
            id: crypto.randomUUID(),
            type: relation,
            sourceId,
            targetId,
            metadata: new Map(),
            createdAt: new Date(),
            episodeIds: []
        };
        
        await (this.storage as IGraphStorage).addEdge(edge);
    }

    /**
     * Convert a graph node to an episodic memory unit
     */
    protected graphNodeToEpisodicUnit(node: IGraphNode): IEpisodicMemoryUnit {
        const timestamp = node.validAt || node.createdAt;
        return {
            id: node.id,
            content: {
                ...node.content,
                timestamp
            },
            metadata: node.metadata,
            memoryType: MemoryType.EPISODIC,
            createdAt: node.createdAt,
            timestamp
        };
    }

    /**
     * Convert an episodic memory unit to a graph node
     */
    protected episodicUnitToGraphNode(unit: IEpisodicMemoryUnit): IGraphNode {
        return {
            id: unit.id,
            type: 'episode',
            content: unit.content,
            metadata: unit.metadata,
            createdAt: unit.createdAt,
            validAt: unit.content.timestamp,
            memoryType: unit.memoryType,
            timestamp: unit.timestamp
        };
    }

    /**
     * Convert multiple graph nodes to episodic memory units
     */
    protected graphNodesToEpisodicUnits(nodes: IGraphNode[]): IEpisodicMemoryUnit[] {
        return nodes
            .filter(node => node.type === 'episode')
            .map(node => this.graphNodeToEpisodicUnit(node));
    }

    /**
     * Find temporally adjacent episodes
     */
    protected async findTemporallyAdjacentEpisodes(episodeId: string): Promise<[IEpisodicMemoryUnit[], IEpisodicMemoryUnit[]]> {
        const episode = await (this.storage as IGraphStorage).getNode(episodeId);
        if (!episode) {
            throw new Error(`Episode ${episodeId} not found`);
        }

        // Use mutable variables for date calculations
        const referenceDate = episode.validAt || episode.createdAt;
        let beforeStartTime = new Date(referenceDate.getTime() - 24 * 60 * 60 * 1000);
        let afterEndTime = new Date(referenceDate.getTime() + 24 * 60 * 60 * 1000);

        // Handle undefined validAt by using createdAt as fallback
        if (episode.validAt) {
            if (episode.validAt < beforeStartTime) {
                beforeStartTime = new Date(episode.validAt.getTime());
            }
            if (episode.validAt > afterEndTime) {
                afterEndTime = new Date(episode.validAt.getTime());
            }
        }

        const [beforeNodes, afterNodes] = await Promise.all([
            this.findEpisodesInRange(beforeStartTime, referenceDate),
            this.findEpisodesInRange(referenceDate, afterEndTime)
        ]);

        return [
            beforeNodes.filter(e => e.id !== episodeId),
            afterNodes.filter(e => e.id !== episodeId)
        ];
    }

    /**
     * Get adjacent episodes
     */
    async getAdjacentEpisodes(episodeId: string): Promise<[IGraphNode[], IGraphNode[]]> {
        const episode = await (this.storage as IGraphStorage).getNode(episodeId);
        if (!episode) {
            throw new Error(`Episode ${episodeId} not found`);
        }

        const referenceDate = episode.validAt || episode.createdAt;
        const startDate = new Date(referenceDate.getTime() - 24 * 60 * 60 * 1000);
        const endDate = new Date(referenceDate.getTime() + 24 * 60 * 60 * 1000);

        // Find episodes before and after
        const [beforeNodes, afterNodes] = await Promise.all([
            (this.storage as IGraphStorage).findNodes({
                nodeTypes: ['episode'],
                temporal: {
                    validBefore: referenceDate
                },
                maxDistance: 5
            }),
            (this.storage as IGraphStorage).findNodes({
                nodeTypes: ['episode'],
                temporal: {
                    validAfter: referenceDate
                },
                maxDistance: 5
            })
        ]);

        return [beforeNodes, afterNodes];
    }

    /**
     * Find temporally adjacent episodes in business time
     */
    protected async findTemporallyAdjacentEpisodesInBusinessTime(episodeId: string): Promise<[IGraphNode[], IGraphNode[]]> {
        const episode = await (this.storage as IGraphStorage).getNode(episodeId);
        if (!episode?.validAt) {
            return [[], []];
        }

        // Find episodes before and after
        const [beforeNodes, afterNodes] = await Promise.all([
            (this.storage as IGraphStorage).findNodes({
                nodeTypes: ['episode'],
                temporal: {
                    validBefore: episode.validAt
                },
                maxDistance: 5
            }),
            (this.storage as IGraphStorage).findNodes({
                nodeTypes: ['episode'],
                temporal: {
                    validAfter: episode.validAt
                },
                maxDistance: 5
            })
        ]);

        return [beforeNodes, afterNodes];
    }

    /**
     * Get temporal context for an episode
     */
    public async getTemporalContext(episodeId: string): Promise<{
        episode: IMemoryUnit;
        before: IMemoryUnit[];
        after: IMemoryUnit[];
    }> {
        const episode = await (this.storage as IGraphStorage).getNode(episodeId);
        if (!episode) {
            throw new Error(`Episode ${episodeId} not found`);
        }

        // Use mutable variables for date calculations
        const referenceDate = episode.validAt || episode.createdAt;
        const searchStartDate = new Date(referenceDate.getTime() - 24 * 60 * 60 * 1000);
        const searchEndDate = new Date(referenceDate.getTime() + 24 * 60 * 60 * 1000);

        // Convert nodes to memory units
        const [beforeUnits, afterUnits] = await Promise.all([
            this.findEpisodesInRange(searchStartDate, referenceDate),
            this.findEpisodesInRange(referenceDate, searchEndDate)
        ]);

        // Convert episode to memory unit
        const episodeUnit = this.graphNodeToEpisodicUnit(episode);

        return {
            episode: episodeUnit,
            before: beforeUnits,
            after: afterUnits
        };
    }
}
