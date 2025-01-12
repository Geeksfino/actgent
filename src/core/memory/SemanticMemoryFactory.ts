import { DeclarativeMemoryFactory } from './DeclarativeMemoryFactory';
import { ISemanticMemoryUnit, ConceptNode, ConceptRelation, MemoryType } from './types';
import crypto from 'crypto';

/**
 * Factory class for creating semantic memory units
 */
export class SemanticMemoryFactory extends DeclarativeMemoryFactory {
    public createMemoryUnit(content: any, metadata?: Map<string, any>): ISemanticMemoryUnit {
        const conceptId = crypto.randomUUID();
        const node: ConceptNode = {
            id: conceptId,
            name: typeof content === 'string' ? content : content.concept,
            confidence: metadata?.get('confidence') || 0.5,
            source: metadata?.get('source') || 'unknown',
            lastVerified: new Date(),
            properties: new Map(metadata?.get('properties') || [])
        };

        const conceptGraph = {
            nodes: new Map([[conceptId, node]]),
            relations: [] as ConceptRelation[]
        };

        return {
            id: metadata?.get('id') || conceptId,
            concept: typeof content === 'string' ? content : content.concept,
            conceptGraph,
            confidence: node.confidence,
            source: node.source,
            lastVerified: node.lastVerified,
            content,
            metadata: metadata || new Map(),
            timestamp: new Date(),
            memoryType: MemoryType.SEMANTIC,
            accessCount: 0,
            lastAccessed: new Date()
        };
    }
}
