import { IEpisodicMemoryUnit, EmotionalContext, MemoryContext } from './types';
import crypto from 'crypto';

/**
 * Factory class for creating episodic memory units
 */
export class EpisodicMemoryFactory {
    /**
     * Creates a new episodic memory unit
     * 
     * @param content The content of the memory unit
     * @param metadata Optional metadata for the memory unit
     * @returns A new episodic memory unit
     */
    public createMemoryUnit(content: any, metadata?: Map<string, any>): IEpisodicMemoryUnit {
        const emotions: EmotionalContext = metadata?.get('emotions') || {
            valence: 0,
            arousal: 0,
            dominance: 0,
            confidence: 0
        };

        const context: MemoryContext = metadata?.get('context') || {
            emotionalState: emotions,
            topicHistory: [],
            userPreferences: new Map(),
            interactionPhase: 'introduction'
        };

        return {
            id: metadata?.get('id') || crypto.randomUUID(),
            content: {
                timeSequence: Date.now(),
                location: metadata?.get('location') || 'unknown',
                actors: metadata?.get('actors') || [],
                actions: metadata?.get('actions') || [],
                emotions,
                context,
                coherenceScore: metadata?.get('coherenceScore') || 0,
                timestamp: new Date(),
                relatedTo: metadata?.get('relatedTo') || []
            },
            metadata: metadata || new Map(),
            timestamp: new Date(),
            accessCount: 0,
            lastAccessed: new Date()
        };
    }
}
