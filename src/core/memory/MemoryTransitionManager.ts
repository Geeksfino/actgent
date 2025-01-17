import { Subject, interval, Observable } from 'rxjs';
import { filter } from 'rxjs/operators';
import { MemoryType, IMemoryUnit } from './base';
import { MemoryEvent, MemoryEventType, IMemoryEventHandler } from './events';
import { IMemoryMonitor, MonitorSignalType } from './monitors';
import { logger } from '../Logger';

/**
 * Memory Transition Manager
 * Manages system signals and invokes monitors based on their configurations
 */
export class MemoryTransitionManager {
    private eventsSubject$ = new Subject<MemoryEvent>();
    private readonly events$ = this.eventsSubject$.asObservable();
    private handlers: Map<MemoryEventType, IMemoryEventHandler[]> = new Map();
    private monitors: Map<string, IMemoryMonitor> = new Map();
    private isMonitoring = false;
    
    // Track turn counts
    private turnCount = 0;
    private lastUserTurn = 0;
    private lastAssistantTurn = 0;
    
    // Track time-based monitors
    private timeIntervalSubscriptions = new Map<string, { subscription: any, lastCheck: Date }>();

    /**
     * Register an event handler
     */
    public registerHandler(handler: IMemoryEventHandler): void {
        const eventTypes = handler.canHandleEventTypes();
        for (const type of eventTypes) {
            const handlers = this.handlers.get(type) || [];
            handlers.push(handler);
            this.handlers.set(type, handlers);
        }
    }

    /**
     * Unregister an event handler
     */
    public unregisterHandler(handler: IMemoryEventHandler): void {
        for (const [type, handlers] of this.handlers.entries()) {
            const index = handlers.indexOf(handler);
            if (index !== -1) {
                handlers.splice(index, 1);
                if (handlers.length === 0) {
                    this.handlers.delete(type);
                }
            }
        }
    }

    /**
     * Emit a memory event
     */
    public emitEvent(event: MemoryEvent): void {
        logger.debug(`Emitting event: ${event.type}`);
        
        const handlers = this.handlers.get(event.type) || [];
        if (handlers.length === 0) {
            logger.warn(`No handlers registered for event type: ${event.type}`);
            return;
        }

        logger.info(
            `Dispatching ${event.type} event to ${handlers.length} handlers`
        );

        for (const handler of handlers) {
            try {
                handler.onEvent(event);
            } catch (error) {
                logger.error('Error in event handler:', error);
            }
        }
    }

    /**
     * Register a memory monitor and set up its signal handling
     */
    public registerMonitor(monitor: IMemoryMonitor): void {
        if (this.monitors.has(monitor.id)) {
            logger.warn(`Monitor with ID ${monitor.id} already exists. Stopping existing monitor.`);
            this.stopMonitorSignals(monitor.id);
            this.monitors.get(monitor.id)?.stop();
        }
        
        this.monitors.set(monitor.id, monitor);
        
        // If monitoring is already active, start the new monitor and its signals
        if (this.isMonitoring) {
            monitor.start();
            this.setupMonitorSignals(monitor);
        }
    }

    /**
     * Unregister a memory monitor
     */
    public unregisterMonitor(monitorId: string): void {
        const monitor = this.monitors.get(monitorId);
        if (monitor) {
            this.stopMonitorSignals(monitorId);
            monitor.stop();
            this.monitors.delete(monitorId);
        }
    }

    /**
     * Start all registered monitors
     */
    public startMonitoring(): void {
        if (this.isMonitoring) {
            logger.warn('Monitoring is already active');
            return;
        }
        
        logger.info(`Starting memory monitoring with ${this.monitors.size} monitors`);
        this.isMonitoring = true;
        
        // Set up signals for each monitor
        for (const monitor of this.monitors.values()) {
            if (monitor.config.enabled) {
                logger.info(`Setting up signals for monitor: ${monitor.id}`);
                this.setupMonitorSignals(monitor);
            }
        }
    }

    /**
     * Stop all registered monitors
     */
    public stopMonitoring(): void {
        if (!this.isMonitoring) return;
        this.isMonitoring = false;
        
        // Stop all monitors and their signals
        for (const [monitorId, monitor] of this.monitors.entries()) {
            this.stopMonitorSignals(monitorId);
            monitor.stop();
        }
        
        // Reset counters
        this.turnCount = 0;
        this.lastUserTurn = 0;
        this.lastAssistantTurn = 0;
    }

    /**
     * Get all registered monitors
     */
    public getMonitors(): Map<string, IMemoryMonitor> {
        return new Map(this.monitors);
    }

    /**
     * Handle a user turn completion
     */
    public onUserTurnEnd(): void {
        this.turnCount++;
        this.lastUserTurn = this.turnCount;
        this.processSignal(MonitorSignalType.USER_TURN_END);
        this.checkTurnCounts();
    }

    /**
     * Handle an assistant turn completion
     */
    public onAssistantTurnEnd(): void {
        this.turnCount++;
        this.lastAssistantTurn = this.turnCount;
        this.processSignal(MonitorSignalType.ASSISTANT_TURN_END);
        this.checkTurnCounts();
    }

    /**
     * Process a system signal
     */
    private processSignal(trigger: MonitorSignalType): void {
        // Find monitors that match this trigger
        const matchingMonitors = Array.from(this.monitors.values())
            .filter(monitor => monitor.config.enabled && monitor.config.signal === trigger);

        // Sort by priority
        matchingMonitors.sort((a, b) => b.config.priority - a.config.priority);

        // Invoke each monitor
        for (const monitor of matchingMonitors) {
            monitor.monitor().subscribe({
                next: (event: MemoryEvent) => {
                    this.emitEvent(event);
                },
                error: (error: unknown) => {
                    logger.error(`Error in monitor ${monitor.id} during signal processing:`, error);
                }
            });
        }
    }

    /**
     * Set up signal handling for a monitor based on its configuration
     */
    private setupMonitorSignals(monitor: IMemoryMonitor): void {
        const { signal, signalConfig } = monitor.config;
        
        logger.debug(`Setting up ${signal} signal for monitor ${monitor.id}`);

        switch (signal) {
            case MonitorSignalType.TIME_INTERVAL:
                if (signalConfig.timeInterval) {
                    const { intervalMs, initialDelayMs = 0 } = signalConfig.timeInterval;
                    const subscription = interval(intervalMs).subscribe(() => {
                        this.processSignal(MonitorSignalType.TIME_INTERVAL);
                    });
                    this.timeIntervalSubscriptions.set(monitor.id, {
                        subscription,
                        lastCheck: new Date()
                    });
                }
                break;
                
            case MonitorSignalType.CAPACITY_THRESHOLD:
                if (signalConfig.capacityThreshold) {
                    logger.info(
                        `Setting up capacity threshold check interval for monitor ${monitor.id} (threshold: ${signalConfig.capacityThreshold.threshold * 100}%)`
                    );
                    
                    // Set up interval to check capacity threshold
                    const subscription = interval(1000).subscribe(() => {
                        if (this.isMonitoring) {
                            logger.debug(`Running scheduled capacity check for monitor ${monitor.id}`);
                            this.checkCapacityThresholds();
                        }
                    });
                    this.timeIntervalSubscriptions.set(monitor.id, {
                        subscription,
                        lastCheck: new Date()
                    });
                }
                break;
                
            case MonitorSignalType.CONTEXT_CHANGE:
                // Context changes are triggered by memory operations
                break;
                
            case MonitorSignalType.EMOTION_PEAK:
                // Emotion peaks are detected during context updates
                break;
                
            case MonitorSignalType.GOAL_COMPLETION:
                // Goal completion is triggered by task system
                break;
        }
    }

    /**
     * Stop and clean up signal handling for a monitor
     */
    private stopMonitorSignals(monitorId: string): void {
        // Clean up time-based subscriptions
        const timeSubscription = this.timeIntervalSubscriptions.get(monitorId);
        if (timeSubscription) {
            timeSubscription.subscription.unsubscribe();
            this.timeIntervalSubscriptions.delete(monitorId);
        }
    }

    /**
     * Check turn counts for monitors using TURN_COUNT trigger
     */
    private checkTurnCounts(): void {
        const turnCountMonitors = Array.from(this.monitors.values())
            .filter(m => m.config.enabled && m.config.signal === MonitorSignalType.TURN_COUNT);
            
        for (const monitor of turnCountMonitors) {
            const turnConfig = monitor.config.signalConfig.turnCount;
            if (!turnConfig) continue;
            
            const { count, roles } = turnConfig;
            let shouldTrigger = false;
            
            if (!roles || roles.length === 0) {
                // No specific roles, just check total turns
                shouldTrigger = this.turnCount % count === 0;
            } else {
                // Check specific role turns
                if (roles.includes('user') && (this.lastUserTurn - this.lastAssistantTurn === count)) {
                    shouldTrigger = true;
                }
                if (roles.includes('assistant') && (this.lastAssistantTurn - this.lastUserTurn === count)) {
                    shouldTrigger = true;
                }
            }
            
            if (shouldTrigger) {
                monitor.monitor().subscribe({
                    next: (event: MemoryEvent) => {
                        this.emitEvent(event);
                    },
                    error: (error: unknown) => {
                        logger.error(`Error in turn count monitor ${monitor.id}:`, error);
                    }
                });
            }
        }
    }

    /**
     * Check capacity thresholds for monitors using CAPACITY_THRESHOLD trigger
     */
    private checkCapacityThresholds(): void {
        const capacityMonitors = Array.from(this.monitors.values())
            .filter(monitor => 
                monitor.config.enabled && 
                monitor.config.signal === MonitorSignalType.CAPACITY_THRESHOLD &&
                monitor.config.signalConfig.capacityThreshold
            );

        logger.debug(`Checking capacity thresholds for ${capacityMonitors.length} monitors`);

        // Sort by priority
        capacityMonitors.sort((a, b) => b.config.priority - a.config.priority);

        // Check each monitor's capacity
        for (const monitor of capacityMonitors) {
            // Always call monitor() to get fresh capacity values
            monitor.monitor().subscribe({
                next: (event: MemoryEvent) => {
                    if (event.type === 'system:warn:capacity') {
                        logger.info(`Monitor ${monitor.id}: Emitting capacity warning event`);
                        this.emitEvent(event);
                    }
                },
                error: (error: unknown) => {
                    logger.error(`Error in capacity monitor ${monitor.id}:`, error);
                }
            });
        }
    }
}
