import { IProceduralMemoryUnit, ProceduralMetadata } from './types';
import { MemoryType } from '../../base';
import crypto from 'crypto';

/**
 * Factory class for creating procedural memory units
 */
export class ProceduralMemoryFactory {
    /**
     * Create a new procedural memory unit
     * @param content The content containing procedure details
     * @param metadata Optional metadata for the memory unit
     * @returns A new procedural memory unit
     */
    static createMemoryUnit(content: any, metadata?: Map<string, any>): IProceduralMemoryUnit {
        const timestamp = new Date();
        const proceduralMetadata = {
            type: MemoryType.PROCEDURAL,
            timestamp,
            proficiency: metadata?.get('proficiency') || 0.1,
            successCount: 0,
            failureCount: 0,
            lastExecuted: undefined
        } as ProceduralMetadata;

        return {
            id: crypto.randomUUID(),
            memoryType: MemoryType.PROCEDURAL,
            timestamp,
            content,
            metadata: proceduralMetadata,
            accessCount: 0,
            lastAccessed: timestamp,
            procedure: content.procedure,
            expectedOutcomes: content.expectedOutcomes || [],
            applicableContext: content.applicableContext || []
        };
    }

    /**
     * Create a procedural memory unit from existing data
     * @param data Existing memory unit data
     * @returns A procedural memory unit
     */
    static fromExisting(data: Partial<IProceduralMemoryUnit>): IProceduralMemoryUnit {
        const timestamp = new Date();
        const metadata = {
            type: MemoryType.PROCEDURAL,
            timestamp,
            proficiency: data.metadata?.get('proficiency') || 0.1,
            successCount: data.metadata?.get('successCount') || 0,
            failureCount: data.metadata?.get('failureCount') || 0,
            lastExecuted: data.metadata?.get('lastExecuted')
        } as ProceduralMetadata;

        return {
            id: data.id || crypto.randomUUID(),
            memoryType: MemoryType.PROCEDURAL,
            timestamp: data.timestamp || timestamp,
            content: data.content,
            metadata,
            lastAccessed: data.lastAccessed || timestamp,
            accessCount: data.accessCount || 0,
            procedure: data.procedure || '',
            expectedOutcomes: data.expectedOutcomes || [],
            applicableContext: data.applicableContext || []
        };
    }

    /**
     * Update memory unit after successful execution
     * @param unit Memory unit to update
     * @returns Updated memory unit
     */
    static recordSuccess(unit: IProceduralMemoryUnit): IProceduralMemoryUnit {
        const metadata = unit.metadata;
        metadata.successCount = (metadata.successCount || 0) + 1;
        metadata.proficiency = Math.min(1, (metadata.proficiency || 0) + 0.1);
        metadata.lastExecuted = new Date();

        return {
            ...unit,
            metadata
        };
    }

    /**
     * Update memory unit after failed execution
     * @param unit Memory unit to update
     * @returns Updated memory unit
     */
    static recordFailure(unit: IProceduralMemoryUnit): IProceduralMemoryUnit {
        const metadata = unit.metadata;
        metadata.failureCount = (metadata.failureCount || 0) + 1;
        metadata.proficiency = Math.max(0, (metadata.proficiency || 0) - 0.05);
        metadata.lastExecuted = new Date();

        return {
            ...unit,
            metadata
        };
    }
}
