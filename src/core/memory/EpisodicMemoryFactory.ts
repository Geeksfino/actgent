import { 
    IMemoryUnit, 
    MemoryType, 
    SessionMemoryContext,
    EmotionalState,
    EmotionalContextImpl
} from './types';
import crypto from 'crypto';

/**
 * Factory for creating episodic memory units with proper metadata
 */
export class EpisodicMemoryFactory {
    /**
     * Create an episodic memory unit with the given content and context
     */
    public static createMemory(
        content: any,
        metadata: Map<string, any>
    ): IMemoryUnit {
        return {
            id: crypto.randomUUID(),
            content,
            metadata,
            timestamp: new Date(),
            memoryType: MemoryType.EPISODIC,
            priority: 0,
            consolidationMetrics: {
                semanticSimilarity: 0,
                contextualOverlap: 0,
                temporalProximity: 0,
                sourceReliability: 0,
                confidenceScore: 0,
                accessCount: 0,
                lastAccessed: new Date(),
                createdAt: new Date(),
                importance: 0,
                relevance: 0
            },
            associations: new Set<string>()
        };
    }
}
