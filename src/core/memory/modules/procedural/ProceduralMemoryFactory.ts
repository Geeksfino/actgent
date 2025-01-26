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
        const now = new Date();
        
        // Create metadata with required fields
        const proceduralMetadata = new Map<string, any>([
            ['type', MemoryType.PROCEDURAL],
            ['timestamp', now],
            ['proficiency', 0.1],
            ['successCount', 0],
            ['failureCount', 0],
            ['lastExecuted', now]
        ]) as ProceduralMetadata;

        // Merge with provided metadata if any
        if (metadata) {
            for (const [key, value] of metadata.entries()) {
                proceduralMetadata.set(key, value);
            }
        }

        return {
            id: crypto.randomUUID(),
            memoryType: MemoryType.PROCEDURAL,
            timestamp: now,
            content,
            metadata: proceduralMetadata,
            lastAccessed: now,
            accessCount: 0,
            procedure: '',
            expectedOutcomes: [],
            applicableContext: [],
            createdAt: now,
            validAt: now
        };
    }

    /**
     * Create a procedural memory unit from existing data
     * @param data Existing memory unit data
     * @returns A procedural memory unit
     */
    static fromExisting(data: Partial<IProceduralMemoryUnit>): IProceduralMemoryUnit {
        const now = new Date();
        
        // Create metadata with required fields, using existing values or defaults
        const metadata = new Map<string, any>([
            ['type', MemoryType.PROCEDURAL],
            ['timestamp', data.timestamp || now],
            ['proficiency', data.metadata?.get('proficiency') || 0.1],
            ['successCount', data.metadata?.get('successCount') || 0],
            ['failureCount', data.metadata?.get('failureCount') || 0],
            ['lastExecuted', data.metadata?.get('lastExecuted') || now]
        ]) as ProceduralMetadata;

        // Merge any additional metadata
        if (data.metadata) {
            for (const [key, value] of data.metadata.entries()) {
                if (!['type', 'timestamp', 'proficiency', 'successCount', 'failureCount', 'lastExecuted'].includes(key)) {
                    metadata.set(key, value);
                }
            }
        }

        return {
            id: data.id || crypto.randomUUID(),
            memoryType: MemoryType.PROCEDURAL,
            timestamp: data.timestamp || now,
            content: data.content,
            metadata,
            lastAccessed: data.lastAccessed || now,
            accessCount: data.accessCount || 0,
            procedure: data.procedure || '',
            expectedOutcomes: data.expectedOutcomes || [],
            applicableContext: data.applicableContext || [],
            createdAt: data.createdAt || now,
            validAt: data.validAt || now
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
