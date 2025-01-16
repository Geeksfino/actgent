import { Subject, Observable } from 'rxjs';
import { MemoryEvent } from './events';
import { IMemoryMonitor, MonitorConfig, MonitorMetrics } from './monitors';
import { logger } from '../Logger';

/**
 * Abstract base class for memory monitors
 * Monitors are invoked by the TransitionManager based on system signals
 * and produce events by reading their associated memory
 */
export abstract class AbstractMemoryMonitor implements IMemoryMonitor {
    protected eventsSubject$ = new Subject<MemoryEvent>();
    protected isActive = false;
    private _metrics: MonitorMetrics = {
        lastInvoked: new Date(),
        eventCount: 0,
        status: 'inactive'
    };

    constructor(
        public readonly id: string,
        public readonly config: MonitorConfig
    ) {}

    /**
     * Get current monitor metrics
     */
    public get metrics(): MonitorMetrics {
        return { ...this._metrics };
    }

    /**
     * Start accepting invocations from TransitionManager
     */
    public start(): void {
        if (this.isActive) return;
        this.isActive = true;
        this._metrics.status = 'active';
        logger.debug(`Monitor ${this.id} started`);
    }

    /**
     * Stop accepting invocations from TransitionManager
     */
    public stop(): void {
        if (!this.isActive) return;
        this.isActive = false;
        this._metrics.status = 'inactive';
        logger.debug(`Monitor ${this.id} stopped`);
    }

    /**
     * Reset monitor state
     */
    public reset(): void {
        this._metrics = {
            lastInvoked: new Date(),
            eventCount: 0,
            status: this.isActive ? 'active' : 'inactive'
        };
        logger.debug(`Monitor ${this.id} reset`);
    }

    /**
     * Called by TransitionManager when signals match this monitor's config.
     * Implementations should read their associated memory and emit events.
     */
    public abstract monitor(): Observable<MemoryEvent>;

    /**
     * Helper method for implementations to emit events
     */
    protected emitEvent(event: MemoryEvent): void {
        if (!this.isActive) return;
        
        this._metrics.lastInvoked = new Date();
        this._metrics.eventCount++;
        
        this.eventsSubject$.next(event);
        logger.debug(`Monitor ${this.id} emitted event:`, event);
    }
}
