import { IEpisodicMemoryUnit } from './types';

/**
 * Factory class for creating episodic memory units
 */
export class EpisodicMemoryFactory {
    private static timeSequence: number = 0;

    /**
     * Creates a new episodic memory unit
     * 
     * @param content The content of the memory unit
     * @param metadata Optional metadata for the memory unit
     * @returns A new episodic memory unit
     */
    public createMemoryUnit(content: any, metadata?: Map<string, any>): Partial<IEpisodicMemoryUnit> {
        return {
            content: {
                timeSequence: ++EpisodicMemoryFactory.timeSequence,
                location: content.location || '',
                actors: content.actors || [],
                actions: content.actions || [],
                emotions: content.emotions || new Map(),
                timestamp: content.timestamp || new Date(),
                relatedTo: content.relatedTo || []
            },
            metadata: metadata || new Map()
        };
    }
}
