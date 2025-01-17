import { Observable } from 'rxjs';
import { MemoryEvent } from './events';

/**
 * System signals that can trigger monitor invocations
 */
export enum MonitorSignalType {
    // Time-based signals
    TIME_INTERVAL = 'time_interval',       // Regular time intervals
    CRON_SCHEDULE = 'cron_schedule',       // Cron-based schedule
    
    // Turn-based signals
    TURN_COUNT = 'turn_count',             // Every N turns
    USER_TURN_END = 'user_turn_end',       // After user turns
    ASSISTANT_TURN_END = 'assistant_turn_end', // After assistant turns
    
    // State-based signals
    CAPACITY_THRESHOLD = 'capacity_threshold', // Memory capacity threshold reached
    CONTEXT_CHANGE = 'context_change',     // Context changes detected
    EMOTION_PEAK = 'emotion_peak',         // Emotional intensity peaks
    GOAL_COMPLETION = 'goal_completion',    // Goals completed
    
    // Composite signals
    COMPOSITE = 'composite'                // Combination of other signals
}

/**
 * Configuration for different signal types
 */
export interface SignalConfig {
    // Time-based configs
    timeInterval?: {
        intervalMs: number;
        initialDelayMs?: number;
    };
    cronSchedule?: {
        expression: string;  // Cron expression
    };
    
    // Turn-based configs
    turnCount?: {
        count: number;           // How many turns to wait
        roles?: ('user' | 'assistant')[];  // Which roles to count
    };
    
    // State-based configs
    capacityThreshold?: {
        threshold: number;       // Capacity threshold percentage
        current: number;        // Current capacity
        max: number;           // Maximum capacity
    };
    contextChange?: {
        trackedKeys: string[];  // Context keys to track
    };
    emotionPeak?: {
        threshold: number;     // Emotional intensity threshold
    };
    goalCompletion?: {
        goalIds: string[];    // Goals to track
    };
    
    // Composite config
    composite?: {
        triggers: MonitorSignalType[];
        operator: 'AND' | 'OR';
    };
}

/**
 * Monitor configuration that specifies when and how it should be invoked
 */
export interface MonitorConfig {
    /** Primary trigger type */
    signal: MonitorSignalType;
    
    /** Signal-specific configuration */
    signalConfig: SignalConfig;
    
    /** Additional condition that must be met */
    condition?: () => boolean;
    
    /** Priority of this monitor (higher numbers = higher priority) */
    priority: number;
    
    /** Whether monitoring is enabled */
    enabled: boolean;
}

/**
 * Monitor metrics for tracking monitor behavior
 */
export interface MonitorMetrics {
    /** Last time the monitor was invoked */
    lastInvoked: Date;
    
    /** Number of events generated */
    eventCount: number;
    
    /** Current monitor status */
    status: 'active' | 'inactive';
    
    /** Additional monitor-specific metrics */
    custom?: Record<string, any>;
}

/**
 * Memory Monitor Interface
 * Monitors read from their associated memory when invoked by the TransitionManager
 * and produce events based on the memory state.
 */
export interface IMemoryMonitor {
    /** Unique identifier for this monitor */
    readonly id: string;
    
    /** Monitor configuration specifying when it should be invoked */
    readonly config: MonitorConfig;
    
    /** Current monitor metrics */
    readonly metrics: MonitorMetrics;
    
    /** 
     * Called by TransitionManager when signals match the monitor's config.
     * Monitor should read its associated memory and produce relevant events.
     */
    monitor(): Observable<MemoryEvent>;
    
    /** Start accepting invocations */
    start(): void;
    
    /** Stop accepting invocations */
    stop(): void;
    
    /** Reset monitor state */
    reset(): void;
}
