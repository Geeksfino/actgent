import { MemoryType, IMemoryUnit } from './base';
import { MemoryEvent } from './events';

/**
 * Memory Transition
 */
export enum TransitionTrigger {
    TIME_BASED = 'time_based',
    CONTEXT_BASED = 'context_based',
    EMOTION_BASED = 'emotion_based',
    CAPACITY_BASED = 'capacity_based',
    USER_INSTRUCTED = 'user_instructed',
    CONSOLIDATION_BASED = 'consolidation_based'
}

/**
 * Transition metadata
 */
export interface TransitionMetadata {
    userInstruction?: {
        command: string;
        target: string;
    };
    emotionalPeak?: {
        intensity: number;
        emotion: string;
    };
    goalRelevance?: {
        score: number;
        goals: string[];
    };
    timeThreshold?: {
        elapsed: number;
        timestamp: Date;
    };
    capacityLimit?: {
        current: number;
        max: number;
    };
}

/**
 * Transition configuration
 */
export interface TransitionConfig {
    trigger: TransitionTrigger;
    condition: (event: MemoryEvent) => boolean;
    priority: number;
    threshold: number;
    metadata?: TransitionMetadata;
}

/**
 * Transition criteria
 */
export interface TransitionCriteria {
    contextualCoherence: number;
    emotionalSalience: number;
    goalRelevance: number;
    topicContinuity: number;
    temporalProximity: number;
}

export enum ConsolidationStatus {
    NEW = 'new',
    PROCESSING = 'processing',
    CONSOLIDATED = 'consolidated',
    FAILED = 'failed'
}

/**
 * Consolidation Rule
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
