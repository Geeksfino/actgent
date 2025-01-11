import { DeclarativeMemory } from './DeclarativeMemory';
import { IMemoryUnit, IMemoryStorage, IMemoryIndex, MemoryFilter, MemoryType } from './types';

/**
 * Episodic Memory - stores personal experiences and specific events
 * tied to particular times and places
 */
export class EpisodicMemory extends DeclarativeMemory {
    constructor(storage: IMemoryStorage, index: IMemoryIndex) {
        super(storage, index);
        this.subType = MemoryType.EPISODIC;
    }

    /**
     * Store an episodic memory with temporal and contextual information
     */
    async store(content: any, metadata?: Map<string, any>): Promise<IMemoryUnit> {
        const metadataMap = new Map(metadata || []);
        
        // Add temporal metadata if not present
        if (!metadataMap.has('timestamp')) {
            metadataMap.set('timestamp', new Date());
        }

        // Ensure we have a context for this episode
        if (!metadataMap.has('context')) {
            metadataMap.set('context', {
                temporal: metadataMap.get('timestamp'),
                sequential: true
            });
        }

        // Add emotional context if present
        if (content.emotions) {
            const emotionalSignificance = this.calculateEmotionalSignificance(content.emotions);
            metadataMap.set('emotionalSignificance', emotionalSignificance);
        }

        return super.store(content, metadataMap);
    }

    /**
     * Retrieve episodic memories with optional temporal filtering
     */
    async retrieve(filter: MemoryFilter): Promise<IMemoryUnit[]> {
        return super.retrieve({
            ...filter,
            metadataFilters: [
                ...(filter.metadataFilters || []),
                new Map([['sequential', true]])
            ]
        });
    }

    /**
     * Retrieve memories within a specific time range
     */
    async retrieveByTimeRange(startTime: Date, endTime: Date): Promise<IMemoryUnit[]> {
        return this.retrieve({
            dateRange: {
                start: startTime,
                end: endTime
            }
        });
    }

    /**
     * Find similar experiences based on various similarity metrics
     */
    async findSimilarExperiences(memory: IMemoryUnit): Promise<IMemoryUnit[]> {
        const memories = await this.retrieve({});
        const similarities = await Promise.all(
            memories.map(async m => ({
                memory: m,
                similarity: await this.calculateSimilarity(memory, m)
            }))
        );

        return similarities
            .filter(({ similarity }) => similarity > 0.7)
            .sort((a, b) => b.similarity - a.similarity)
            .map(({ memory }) => memory);
    }

    /**
     * Clean up old episodic memories based on importance and age
     */
    async cleanup(): Promise<void> {
        const memories = await this.retrieve({});
        const now = new Date();
        
        for (const memory of memories) {
            const timestamp = memory.metadata.get('timestamp');
            const importance = memory.metadata.get('importance') || 0;
            const age = now.getTime() - timestamp.getTime();
            
            // Clean up memories older than 30 days with low importance
            if (age > 30 * 24 * 60 * 60 * 1000 && importance < 0.3) {
                await this.delete(memory.id);
            }
        }
        
        await super.cleanup();
    }

    private calculateEmotionalSignificance(emotions: Map<string, number>): number {
        let totalSignificance = 0;
        let count = 0;

        for (const [_, intensity] of emotions) {
            totalSignificance += intensity;
            count++;
        }

        return count > 0 ? totalSignificance / count : 0;
    }

    private async calculateSimilarity(memory1: IMemoryUnit, memory2: IMemoryUnit): Promise<number> {
        const weights = {
            temporal: 0.3,
            location: 0.2,
            emotional: 0.3,
            contextual: 0.2
        };

        // Calculate temporal similarity
        const time1 = memory1.metadata.get('timestamp');
        const time2 = memory2.metadata.get('timestamp');
        const temporalSimilarity = this.calculateTemporalSimilarity(time1, time2);

        // Calculate location similarity
        const location1 = memory1.content.location;
        const location2 = memory2.content.location;
        const locationSimilarity = location1 === location2 ? 1 : 0;

        // Calculate emotional similarity
        const emotions1 = memory1.content.emotions;
        const emotions2 = memory2.content.emotions;
        const emotionalSimilarity = this.calculateEmotionalSimilarity(emotions1, emotions2);

        // Calculate contextual similarity
        const context1 = memory1.metadata.get('context');
        const context2 = memory2.metadata.get('context');
        const contextualSimilarity = this.calculateContextualSimilarity(context1, context2);

        return (
            weights.temporal * temporalSimilarity +
            weights.location * locationSimilarity +
            weights.emotional * emotionalSimilarity +
            weights.contextual * contextualSimilarity
        );
    }

    private calculateTemporalSimilarity(time1: Date, time2: Date): number {
        const timeDiff = Math.abs(time1.getTime() - time2.getTime());
        const maxTimeDiff = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
        return Math.max(0, 1 - timeDiff / maxTimeDiff);
    }

    private calculateEmotionalSimilarity(emotions1: Map<string, number>, emotions2: Map<string, number>): number {
        if (!emotions1 || !emotions2) return 0;

        const allEmotions = new Set([...emotions1.keys(), ...emotions2.keys()]);
        let totalDiff = 0;

        for (const emotion of allEmotions) {
            const intensity1 = emotions1.get(emotion) || 0;
            const intensity2 = emotions2.get(emotion) || 0;
            totalDiff += Math.abs(intensity1 - intensity2);
        }

        return Math.max(0, 1 - totalDiff / allEmotions.size);
    }

    private calculateContextualSimilarity(context1: any, context2: any): number {
        if (!context1 || !context2) return 0;

        let matchingKeys = 0;
        let totalKeys = 0;

        for (const key in context1) {
            if (key in context2 && context1[key] === context2[key]) {
                matchingKeys++;
            }
            totalKeys++;
        }

        return totalKeys > 0 ? matchingKeys / totalKeys : 0;
    }
}
