import { Subject } from 'rxjs';
import { filter } from 'rxjs/operators';
import { 
    MemoryEvent, MemoryEventType, 
    IMemoryEventHandler, IMemoryMonitor 
} from './events';
import { logger } from '../Logger';

/**
 * Manages memory event monitoring and dispatch
 */
export class MemoryTransitionManager {
    private eventsSubject$ = new Subject<MemoryEvent>();
    private readonly events$ = this.eventsSubject$.asObservable();
    private handlers: Map<MemoryEventType, IMemoryEventHandler[]> = new Map();
    private monitors: Map<string, IMemoryMonitor> = new Map();
    private isMonitoring = false;

    /**
     * Register an event handler
     */
    public registerHandler(handler: IMemoryEventHandler): void {
        const eventTypes = handler.canHandleEventTypes();
        
        for (const eventType of eventTypes) {
            if (!this.handlers.has(eventType)) {
                this.handlers.set(eventType, []);
            }
            this.handlers.get(eventType)!.push(handler);

            // Subscribe to events of this type
            this.events$.pipe(
                filter(event => event.type === eventType)
            ).subscribe(async (event) => {
                try {
                    await handler.onEvent(event);
                } catch (error) {
                    logger.error(`Error in memory event handler for ${eventType}:`, error);
                }
            });
        }
    }

    /**
     * Unregister an event handler
     */
    public unregisterHandler(handler: IMemoryEventHandler): void {
        const eventTypes = handler.canHandleEventTypes();
        
        for (const eventType of eventTypes) {
            const handlers = this.handlers.get(eventType);
            if (handlers) {
                const index = handlers.indexOf(handler);
                if (index !== -1) {
                    handlers.splice(index, 1);
                }
                if (handlers.length === 0) {
                    this.handlers.delete(eventType);
                }
            }
        }
    }

    /**
     * Register a memory monitor
     */
    public registerMonitor(monitor: IMemoryMonitor): void {
        if (this.monitors.has(monitor.id)) {
            logger.warn(`Monitor with ID ${monitor.id} already exists. Stopping existing monitor.`);
            this.monitors.get(monitor.id)?.stop();
        }
        
        this.monitors.set(monitor.id, monitor);
        
        // Subscribe to monitor's events
        monitor.monitor().pipe(
            filter((event): event is MemoryEvent => event !== undefined && event !== null)
        ).subscribe({
            next: (event) => {
                this.emitEvent(event);
            },
            error: (error) => {
                logger.error(`Error in monitor ${monitor.id}:`, error);
                // Don't stop the monitor on error, let it handle its own lifecycle
            }
        });
        
        // If monitoring is already active, start the new monitor
        if (this.isMonitoring) {
            monitor.start();
        }
    }

    /**
     * Unregister a memory monitor
     */
    public unregisterMonitor(monitorId: string): void {
        const monitor = this.monitors.get(monitorId);
        if (monitor) {
            monitor.stop();
            this.monitors.delete(monitorId);
        }
    }

    /**
     * Start all registered monitors
     */
    public startMonitoring(): void {
        if (this.isMonitoring) {
            return;
        }

        this.isMonitoring = true;
        for (const monitor of this.monitors.values()) {
            monitor.start();
        }
    }

    /**
     * Stop all registered monitors
     */
    public stopMonitoring(): void {
        if (!this.isMonitoring) {
            return;
        }

        this.isMonitoring = false;
        for (const monitor of this.monitors.values()) {
            monitor.stop();
        }
    }

    /**
     * Emit a memory event
     */
    public emitEvent(event: MemoryEvent): void {
        this.eventsSubject$.next(event);
    }

    /**
     * Get all registered monitors
     */
    public getMonitors(): Map<string, IMemoryMonitor> {
        return new Map(this.monitors);
    }
}
