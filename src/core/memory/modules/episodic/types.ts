import { IMemoryUnit, 
    MemoryType, 
    SessionMemoryContext, 
    ConsolidationStatus,
    EmotionalContext
} from '../../types'

/**
 * Interface for episodic memory units, representing experiences and events
 */
export interface IEpisodicMemoryUnit extends IMemoryUnit {
    content: {
        timeSequence: number;
        location: string;
        actors: string[];
        actions: string[];
        emotions: EmotionalContext;
        context: SessionMemoryContext;
        coherenceScore: number;
        emotionalIntensity: number;
        contextualRelevance: number;
        temporalDistance: number;
        userInstruction?: string;
        consolidationStatus?: ConsolidationStatus;
        originalMemories?: string[];  // IDs of memories that were consolidated
        relatedTo?: string[];        // IDs of related memories
        timestamp: Date;
    };
    metadata: Map<string, any>;
}
