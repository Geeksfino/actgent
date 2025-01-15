import { Observable } from 'rxjs';
import { IMemoryUnit, MemoryType } from './base';
import { SessionMemoryContext, EmotionalState } from './context';

// Memory Events
export enum MemoryEventType {
    ACCESS = 'access',
    STORE = 'store',
    MODIFY = 'modify',
    UPDATE = 'update',
    DELETE = 'delete',
    CONSOLIDATE = 'consolidate',
    CAPACITY_WARNING = 'capacity_warning',
    CONTEXT_CHANGE = 'context_change',
    EMOTIONAL_PEAK = 'emotional_peak',
    GOAL_COMPLETED = 'goal_completed',
    MEMORY_ACCESS = 'memory_access'
}

/**
 * Memory Event
 */
export type MemoryEvent = {
    type: MemoryEventType;
    memory: IMemoryUnit | null;  // null for system events like capacity warnings
    context?: SessionMemoryContext;
    emotion?: EmotionalState;
    timestamp: Date;
    metadata?: Map<string, any>;
}

/**
 * Memory Event Handlers
 */
export interface IMemoryEventHandler {
    onEvent(event: MemoryEvent): Promise<void>;
    canHandleEventTypes(): MemoryEventType[];
}

/**
 * Memory Monitor Configuration
 */
export interface IMemoryMonitorConfig {
    /** Whether the monitor is enabled */
    enabled: boolean;
    /** Monitoring interval in milliseconds (for time-based monitors) */
    interval?: number;
    /** Threshold value (for capacity or count-based monitors) */
    threshold?: number;
    /** Custom configuration options */
    options?: Record<string, any>;
}

/**
 * Memory Monitor Metrics
 */
export interface IMemoryMonitorMetrics {
    /** Last time the monitor checked conditions */
    lastCheck: Date;
    /** Number of events generated */
    eventCount: number;
    /** Current monitor status */
    status: 'active' | 'inactive';
    /** Additional monitor-specific metrics */
    custom?: Record<string, any>;
}

/**
 * Memory Monitor Interface
 */
export interface IMemoryMonitor {
    /** Get the monitor's identifier */
    readonly id: string;
    /** Get the monitor's current metrics */
    readonly metrics: IMemoryMonitorMetrics;
    /** Get the monitor's configuration */
    readonly config: IMemoryMonitorConfig;
    /** Start monitoring */
    start(): void;
    /** Stop monitoring */
    stop(): void;
    /** Reset monitor state */
    reset(): void;
    /** Get the observable stream of memory events */
    monitor(): Observable<MemoryEvent>;
    /** Update monitor configuration */
    updateConfig(config: Partial<IMemoryMonitorConfig>): void;
}
