import { DeclarativeMemoryFactory } from './DeclarativeMemoryFactory';
import { IEpisodicMemoryUnit } from './types';

/**
 * Factory class for creating episodic memory units
 */
export class EpisodicMemoryFactory extends DeclarativeMemoryFactory {
    private static timeSequence: number = 0;

    createMemoryUnit(content: any, metadata?: Map<string, any>): IEpisodicMemoryUnit {
        const defaultMetadata = new Map<string, any>([
            ['type', 'episodic'],
            ['timeSequence', EpisodicMemoryFactory.timeSequence++]
        ]);

        const mergedMetadata = this.mergeMetadata(defaultMetadata, metadata);

        return {
            id: crypto.randomUUID(),
            timestamp: this.generateTimestamp(),
            content,
            metadata: mergedMetadata,
            timeSequence: mergedMetadata.get('timeSequence'),
            location: metadata?.get('location') || 'unknown',
            actors: metadata?.get('actors') || [],
            actions: metadata?.get('actions') || [],
            emotions: metadata?.get('emotions') || new Map<string, number>()
        };
    }
}
