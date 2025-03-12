import { IMemoryStorage, IMemoryIndex } from '../../storage';
import { MemoryType, MemoryFilter } from '../../base';
import { DeclarativeMemory } from '../../DeclarativeMemory';
import { IEpisodicMemoryUnit } from './types';
import { EmotionalContext, EmotionalState } from '../../context';
import { z } from 'zod';
import crypto from 'crypto';

/**
 * Episodic Memory - stores personal experiences and specific events
 * tied to particular times and places
 */
export class EpisodicMemory extends DeclarativeMemory {
    constructor(storage: IMemoryStorage, index: IMemoryIndex) {
        super(storage, index, MemoryType.EPISODIC);
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
                throw new Error(`Invalid episodic memory content: ${validationResult.error}`);
            }
            validatedContent = validationResult.data;
        }

        return {
            id: crypto.randomUUID(),
            content: validatedContent,
            metadata: metadata || new Map(),
            timestamp: now,
            memoryType: MemoryType.EPISODIC,
            accessCount: 0,
            lastAccessed: now,
            createdAt: now
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

    isMemoryUnitOfType(unit: any): unit is IEpisodicMemoryUnit {
        return unit && 
               typeof unit === 'object' && 
               unit.memoryType === MemoryType.EPISODIC &&
               unit.content &&
               typeof unit.content.timeSequence === 'number' &&
               typeof unit.content.location === 'string' &&
               Array.isArray(unit.content.actors) &&
               Array.isArray(unit.content.actions) &&
               typeof unit.content.coherenceScore === 'number' &&
               typeof unit.content.emotionalIntensity === 'number' &&
               typeof unit.content.contextualRelevance === 'number' &&
               typeof unit.content.temporalDistance === 'number' &&
               unit.content.timestamp instanceof Date;
    }
}
