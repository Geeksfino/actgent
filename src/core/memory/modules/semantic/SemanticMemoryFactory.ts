import { MemoryType } from '../../types';
import { ISemanticMemoryUnit, ConceptNode, ConceptRelation, createSemanticMetadata, RelationType } from './types';
import crypto from 'crypto';

/**
 * Factory class for creating semantic memory units
 */
export class SemanticMemoryFactory {
    /**
     * Create a memory unit from content and metadata
     */
    static createMemoryUnit(content: any, metadata?: Map<string, any>): ISemanticMemoryUnit {
        const timestamp = new Date();
        if (content.type === 'concept') {
            return SemanticMemoryFactory.createConceptNode(
                content.name,
                content.conceptType,
                content.properties,
                metadata
            );
        } else if (content.type === 'relation') {
            return SemanticMemoryFactory.createConceptRelation(
                content.sourceId,
                content.targetId,
                content.relationType,
                content.properties,
                metadata
            );
        }
        throw new Error('Invalid content type for semantic memory unit');
    }

    /**
     * Create a new concept node memory unit
     */
    static createConceptNode(
        name: string,
        type: string,
        properties: Map<string, any> = new Map(),
        metadata?: Map<string, any>
    ): ISemanticMemoryUnit {
        const timestamp = new Date();
        const concept: ConceptNode = {
            id: crypto.randomUUID(),
            name,
            type,
            confidence: metadata?.get('confidence') || 1.0,
            source: metadata?.get('source') || 'user',
            lastVerified: timestamp,
            properties
        };

        return {
            id: crypto.randomUUID(),
            memoryType: MemoryType.SEMANTIC,
            timestamp,
            content: concept,
            metadata: createSemanticMetadata(timestamp),
            lastAccessed: timestamp,
            accessCount: 0
        };
    }

    /**
     * Create a new concept relation memory unit
     */
    static createConceptRelation(
        sourceId: string,
        targetId: string,
        relationType: RelationType,
        properties: Map<string, any> = new Map(),
        metadata?: Map<string, any>
    ): ISemanticMemoryUnit {
        const timestamp = new Date();
        const relation: ConceptRelation = {
            id: crypto.randomUUID(),
            sourceId,
            targetId,
            type: relationType,
            weight: metadata?.get('weight') || 1.0,
            confidence: metadata?.get('confidence') || 1.0,
            properties
        };

        return {
            id: crypto.randomUUID(),
            memoryType: MemoryType.SEMANTIC,
            timestamp,
            content: relation,
            metadata: createSemanticMetadata(timestamp),
            lastAccessed: timestamp,
            accessCount: 0
        };
    }
}
