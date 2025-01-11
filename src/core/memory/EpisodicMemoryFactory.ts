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
    static createMemory(
        content: any,
        context: SessionMemoryContext,
        metadata?: Map<string, any>
    ): IMemoryUnit {
        const memoryMetadata = new Map<string, any>(metadata || []);
        
        // Set basic metadata
        memoryMetadata.set('type', MemoryType.EPISODIC);
        memoryMetadata.set('timestamp', Date.now());
        memoryMetadata.set('context', context);

        // Extract emotional state if present
        if (context.emotionalState) {
            memoryMetadata.set('emotion', context.emotionalState.getCurrentEmotion());
        }

        // Extract topics if present
        if (context.topicHistory.length > 0) {
            memoryMetadata.set('topics', [...context.topicHistory]);
        }

        // Extract goals if present
        if (context.userGoals.size > 0) {
            memoryMetadata.set('goals', Array.from(context.userGoals));
        }

        return {
            id: crypto.randomUUID(),
            content,
            metadata: memoryMetadata,
            timestamp: new Date(),
            priority: 1.0,
            consolidationMetrics: {
                semanticSimilarity: 0,
                contextualOverlap: 0,
                temporalProximity: 0,
                sourceReliability: 0,
                confidenceScore: 0,
                accessCount: 0,
                lastAccessed: new Date(),
                createdAt: new Date(),
                importance: 1.0,
                relevance: 1.0
            },
            associations: new Set<string>()
        };
    }
}
