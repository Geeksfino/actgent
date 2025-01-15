import { IWorkingMemoryUnit, createWorkingMetadata } from './types';
import { MemoryType } from '../../base';
import crypto from 'crypto';

/**
 * Factory class for creating working memory units
 */
export class WorkingMemoryFactory {
    /**
     * Create a new working memory unit
     * @param content The content to store in the memory unit
     * @param priority Priority level of the memory unit (0-1)
     * @param relevance Relevance score of the memory unit (0-1)
     * @returns A new working memory unit
     */
    static createMemoryUnit(content: any, priority: number = 0.5, relevance: number = 0.5): IWorkingMemoryUnit {
        const timestamp = new Date();
        return {
            id: crypto.randomUUID(),
            memoryType: MemoryType.WORKING,
            timestamp,
            content,
            metadata: createWorkingMetadata(timestamp, priority, relevance),
            lastAccessed: timestamp,
            accessCount: 0
        };
    }

    /**
     * Create a working memory unit from existing data
     * @param data Existing memory unit data
     * @returns A working memory unit
     */
    static fromExisting(data: Partial<IWorkingMemoryUnit>): IWorkingMemoryUnit {
        const timestamp = data.timestamp || new Date();
        const priority = data.metadata?.get('priority') as number || 0.5;
        const relevance = data.metadata?.get('relevance') as number || 0.5;

        return {
            id: data.id || crypto.randomUUID(),
            memoryType: MemoryType.WORKING,
            timestamp,
            content: data.content,
            metadata: createWorkingMetadata(timestamp, priority, relevance),
            lastAccessed: data.lastAccessed || timestamp,
            accessCount: data.accessCount || 0
        };
    }
}
