import { Observable } from 'rxjs';
import { IMemoryUnit, MemoryType } from './base';
import { WorkingMemoryContext, EmotionalState } from './context';

// Memory Events
export type MemoryEventType =
    | 'ephemeral:add:item'
    | 'ephemeral:clear:all'
    | 'working:add:item'
    | 'working:update:items'
    | 'working:forget:item'
    | 'semantic:extract:entities'
    | 'semantic:update:triples'
    | 'semantic:updated:items'
    | 'episodic:create:entry'
    | 'episodic:update:items'
    | 'procedural:learn:procedure'
    | 'procedural:forget:procedure'
    | 'procedural:updated:items'
    | 'system:warn:capacity'
    | 'system:complete:task'
    | 'system:change:context';

/**
 * Memory Event
 */
export type MemoryEvent = {
    type: MemoryEventType;
    memory: IMemoryUnit | null;  // null for system events like capacity warnings
    context?: WorkingMemoryContext;
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
