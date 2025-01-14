import { MemoryType } from '../../types';
import { DeclarativeMemory } from '../../DeclarativeMemory';
import { IMemoryStorage, IMemoryIndex, EmotionalState, MemoryFilter } from '../../types';
import { IEpisodicMemoryUnit } from './types';
import { EpisodicMemoryFactory } from './EpisodicMemoryFactory';
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
    protected createMemoryUnit(content: any, metadata?: Map<string, any>): IEpisodicMemoryUnit {
        return EpisodicMemoryFactory.createMemory(content, metadata || new Map());
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
        return this.createMemoryUnit(content, metadataMap);
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
    public async store(memory: IEpisodicMemoryUnit): Promise<void> {
        await this.storage.store(memory);
    }

    /**
     * Update emotional context for a memory
     */
    public async updateEmotionalContext(
        memoryId: string,
        emotionalState: EmotionalState
    ): Promise<void> {
        const memory = await this.retrieve(memoryId);
        if (!memory) {
            throw new Error('Memory not found');
        }

        memory.metadata.set('emotionalContext', emotionalState);
        await this.storage.update(memory);
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
        const emotionalState = memory.metadata.get('emotionalContext') as EmotionalState;
        const importance = memory.metadata.get('importance') as number || 0.5;
        
        // Calculate emotional intensity from valence and arousal
        const emotionalIntensity = emotionalState ? 
            Math.sqrt(Math.pow(emotionalState.valence, 2) + Math.pow(emotionalState.arousal, 2)) / Math.sqrt(2) : 
            0;

        // Combine factors for final score
        return (emotionalIntensity * 0.6 + importance * 0.4);
    }
}
