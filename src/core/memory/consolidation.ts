import { MemoryType, IMemoryUnit } from './base';
import { MemoryEvent } from './events';

/**
 * Status of memory consolidation process
 */
export enum ConsolidationStatus {
    NEW = 'new',
    PROCESSING = 'processing',
    CONSOLIDATED = 'consolidated',
    FAILED = 'failed'
}

/**
 * Rule for memory consolidation
 */
export interface ConsolidationRule {
    name: string;
    condition: (event: MemoryEvent) => boolean;
    priority: number;
    targetMemoryType: MemoryType;
}

/**
 * Interface for memory consolidation operations
 */
export interface IMemoryConsolidation {
    consolidate(memory: IMemoryUnit): Promise<void>;
    getConsolidationCandidates(): Promise<IMemoryUnit[]>;
    isConsolidationNeeded(memory: IMemoryUnit): boolean;
    updateWorkingMemorySize(delta: number): Promise<void>;
}
