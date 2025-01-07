import { DeclarativeMemoryFactory } from './DeclarativeMemoryFactory';
import { ISemanticMemoryUnit } from './types';

/**
 * Factory class for creating semantic memory units
 */
export class SemanticMemoryFactory extends DeclarativeMemoryFactory {
    createMemoryUnit(content: any, metadata?: Map<string, any>): ISemanticMemoryUnit {
        const defaultMetadata = new Map<string, any>([
            ['type', 'semantic']
        ]);

        const mergedMetadata = this.mergeMetadata(defaultMetadata, metadata);

        return {
            id: crypto.randomUUID(),
            timestamp: this.generateTimestamp(),
            content,
            metadata: mergedMetadata,
            concept: metadata?.get('concept') || '',
            relations: metadata?.get('relations') || new Map<string, string[]>(),
            confidence: metadata?.get('confidence') || 1.0,
            source: metadata?.get('source') || 'system'
        };
    }
}
