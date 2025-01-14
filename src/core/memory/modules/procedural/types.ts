import { IMemoryUnit, MemoryType } from '../../types';

/**
 * Procedural memory metadata
 */
export interface ProceduralMetadata extends Map<string, any> {
    type: MemoryType.PROCEDURAL;
    timestamp: Date;
    /** Proficiency level for this procedure (0-1) */
    proficiency: number;
    /** Number of successful executions */
    successCount: number;
    /** Number of failed executions */
    failureCount: number;
    /** Last execution timestamp */
    lastExecuted?: Date;
}

/**
 * Interface for procedural memory units
 */
export interface IProceduralMemoryUnit extends IMemoryUnit {
    metadata: ProceduralMetadata;
    /** The procedure or action sequence */
    procedure: string;
    /** Expected outcomes or success conditions */
    expectedOutcomes: string[];
    /** Context in which this procedure is applicable */
    applicableContext: string[];
}
