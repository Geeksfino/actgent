import { IMemoryUnit, MemoryType } from '../../types';

/**
 * Working memory metadata interface
 */
export interface WorkingMetadata {
    type: MemoryType.WORKING;
    timestamp: Date;
    priority: number;
    relevance: number;
}

/**
 * Interface for working memory units
 */
export interface IWorkingMemoryUnit extends IMemoryUnit {
    /** Memory type */
    memoryType: MemoryType.WORKING;
    /** Timestamp when this unit was created */
    timestamp: Date;
    /** Memory metadata */
    metadata: Map<string, any>;
    /** Memory content */
    content: any;
    /** Time when this unit was last accessed */
    lastAccessed: Date;
    /** Number of times this unit has been accessed */
    accessCount: number;
}

/**
 * Create working memory metadata
 */
export function createWorkingMetadata(timestamp: Date, priority: number, relevance: number): Map<string, any> {
    const metadata = new Map<string, any>();
    metadata.set('type', MemoryType.WORKING);
    metadata.set('timestamp', timestamp);
    metadata.set('priority', priority);
    metadata.set('relevance', relevance);
    return metadata;
}

export function isWorkingMemory(metadata: Map<string, any>): boolean {
    return metadata.get('type') === MemoryType.WORKING;
}
