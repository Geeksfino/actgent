import { 
    IMemoryUnit, 
    MemoryType
} from '../../types'
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
        const timestamp = new Date();
        const importance = metadata?.get('importance') || 0.5;
        
        // Create metadata with emotional context
        const memoryMetadata = new Map<string, any>();
        memoryMetadata.set('timestamp', timestamp);
        memoryMetadata.set('importance', importance);
        memoryMetadata.set('emotionalContext', metadata?.get('emotionalContext') || {
            valence: 0,
            arousal: 0,
            dominance: 0
        });

        return {
            id: crypto.randomUUID(),
            memoryType: MemoryType.EPISODIC,
            timestamp,
            content,
            metadata: memoryMetadata,
            lastAccessed: timestamp,
            accessCount: 0
        };
    }
}
