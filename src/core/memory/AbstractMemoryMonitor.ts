import { Observable, Subscription, Subject } from 'rxjs';
import { filter } from 'rxjs/operators';
import { IMemoryMonitor, IMemoryMonitorConfig, IMemoryMonitorMetrics, MemoryEvent } from './events';

/**
 * Abstract base class for memory monitors
 */
export abstract class AbstractMemoryMonitor implements IMemoryMonitor {
    private subscription?: Subscription;
    private metricsSubject = new Subject<IMemoryMonitorMetrics>();
    
    public metrics: IMemoryMonitorMetrics = {
        lastCheck: new Date(),
        eventCount: 0,
        status: 'inactive'
    };

    constructor(
        public readonly id: string,
        public config: IMemoryMonitorConfig
    ) {}

    /**
     * Start monitoring
     */
    public start(): void {
        if (this.subscription || !this.config.enabled) {
            return;
        }

        this.metrics.status = 'active';
        this.metricsSubject.next(this.metrics);
        
        this.subscription = this.monitor().pipe(
            filter(() => this.config.enabled)
        ).subscribe({
            next: (event) => {
                this.metrics.lastCheck = new Date();
                this.metrics.eventCount++;
                this.metricsSubject.next(this.metrics);
            },
            error: (error) => {
                console.error(`Error in memory monitor ${this.id}:`, error);
                this.stop();
            }
        });
    }

    /**
     * Stop monitoring
     */
    public stop(): void {
        this.subscription?.unsubscribe();
        this.subscription = undefined;
        this.metrics.status = 'inactive';
        this.metricsSubject.next(this.metrics);
    }

    /**
     * Reset monitor state
     */
    public reset(): void {
        this.stop();
        this.metrics = {
            lastCheck: new Date(),
            eventCount: 0,
            status: 'inactive'
        };
        this.metricsSubject.next(this.metrics);
    }

    /**
     * Update monitor configuration
     */
    public updateConfig(config: Partial<IMemoryMonitorConfig>): void {
        this.config = { ...this.config, ...config };
        
        // If disabled, stop monitoring
        if (!this.config.enabled) {
            this.stop();
        }
        // If enabled and not running, start monitoring
        else if (this.config.enabled && !this.subscription) {
            this.start();
        }
    }

    /**
     * Get the monitor's configuration
     */
    public getConfig(): IMemoryMonitorConfig {
        return { ...this.config };
    }

    /**
     * Get metrics updates as an observable
     */
    public getMetricsUpdates(): Observable<IMemoryMonitorMetrics> {
        return this.metricsSubject.asObservable();
    }

    /**
     * Abstract method to implement the actual monitoring logic
     * @returns Observable stream of memory events
     */
    public abstract monitor(): Observable<MemoryEvent>;

    /**
     * Protected helper to create a base event
     */
    protected createBaseEvent(): Partial<MemoryEvent> {
        return {
            timestamp: new Date(),
            metadata: new Map([['monitorId', this.id]])
        };
    }
}
