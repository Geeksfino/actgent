import { IMemoryStorage, IMemoryIndex, IGraphStorage, IGraphIndex } from '../../storage';
import { MemoryType, MemoryFilter, IMemoryUnit } from '../../base';
import { DeclarativeMemory } from '../../DeclarativeMemory';
import { IEpisodicMemoryUnit } from './types';
import { EmotionalContext, EmotionalState } from '../../context';
import { GraphOperations } from '../../graph/operations';
import { IGraphNode, IGraphEdge, ITemporalMetadata } from '../../graph/types';
import { z } from 'zod';
import crypto from 'crypto';

/**
 * Episodic Memory - stores personal experiences and specific events
 * tied to particular times and places using a graph-based structure
 */
export class EpisodicMemory extends DeclarativeMemory {
    private graphOps: GraphOperations;

    constructor(storage: IGraphStorage, index: IGraphIndex) {
        super(storage, index, MemoryType.EPISODIC);
        this.graphOps = new GraphOperations(storage);
    }

    /**
     * Create an episodic memory unit
     */
    public createMemoryUnit<C>(
        content: C | string, 
        schema?: z.ZodType<C>, 
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
                emotionalIntensity: metadata?.get('emotionalIntensity') || 0,
                contextualRelevance: metadata?.get('contextualRelevance') || 1.0,
                temporalDistance: 0,
                userInstruction: content,
                timestamp: now
            };
        } else {
            if (!schema) {
                throw new Error('Schema is required for object content');
            }
            const validationResult = schema.safeParse(content);
            if (!validationResult.success) {
                throw new Error(`Invalid content: ${validationResult.error}`);
            }
            validatedContent = validationResult.data;
        }

        const memoryUnit: IEpisodicMemoryUnit = {
            id: crypto.randomUUID(),
            content: validatedContent,
            metadata: metadata || new Map(),
            timestamp: now,
            memoryType: MemoryType.EPISODIC
        };

        // Create graph node
        const graphNode: IGraphNode = {
            id: memoryUnit.id,
            type: 'episode',
            content: memoryUnit.content,
            metadata: memoryUnit.metadata,
            timestamp: memoryUnit.timestamp,
            memoryType: memoryUnit.memoryType,
            temporal: {
                eventTime: new Date(memoryUnit.content.timeSequence),
                ingestionTime: now,
                validFrom: now
            }
        };

        // Store in graph
        (this.storage as IGraphStorage).addNode(graphNode);

        return memoryUnit;
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
        return this.createMemoryUnit(content, z.any(), metadataMap);
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
        return episodes
            .filter(node => node.type === 'episode')
            .map(node => ({
                id: node.id,
                content: node.content,
                metadata: node.metadata,
                timestamp: node.timestamp,
                memoryType: MemoryType.EPISODIC
            }));
    }

    /**
     * Find episodes with similar emotional context
     */
    public async findEmotionallySimilar(emotions: EmotionalContext): Promise<IEpisodicMemoryUnit[]> {
        const filter = {
            type: 'episode',
            metadata: new Map<string, any>([['emotions', emotions]])
        };
        
        const episodes = await (this.storage as IGraphStorage).findNodes(filter);
        return episodes.map(node => ({
            id: node.id,
            content: node.content,
            metadata: node.metadata,
            timestamp: node.timestamp,
            memoryType: MemoryType.EPISODIC
        }));
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
        return episodes.map(node => ({
            id: node.id,
            content: node.content,
            metadata: node.metadata,
            timestamp: node.timestamp,
            memoryType: MemoryType.EPISODIC
        }));
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
        return episodes.map(node => ({
            id: node.id,
            content: node.content,
            metadata: node.metadata,
            timestamp: node.timestamp,
            memoryType: MemoryType.EPISODIC
        }));
    }

    /**
     * Create a relationship between episodes
     */
    protected async linkEpisodes(sourceId: string, targetId: string, relationType: string): Promise<void> {
        const edge: IGraphEdge = {
            id: crypto.randomUUID(),
            type: relationType,
            sourceId,
            targetId,
            metadata: new Map(),
            temporal: {
                eventTime: new Date(),
                ingestionTime: new Date()
            }
        };

        await (this.storage as IGraphStorage).addEdge(edge);
    }

    /**
     * Store an episodic memory unit
     */
    public async store(content: Omit<IEpisodicMemoryUnit, 'id' | 'timestamp' | 'memoryType'>): Promise<void> {
        const memoryUnit = this.createMemoryUnit(content.content, z.any(), content.metadata);
        Object.assign(memoryUnit, content);
        await this.storage.store(memoryUnit);
    }

    /**
     * Update the emotional context of a memory
     */
    async updateEmotionalContext(memoryId: string, emotionalContext: EmotionalContext): Promise<void> {
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
}
