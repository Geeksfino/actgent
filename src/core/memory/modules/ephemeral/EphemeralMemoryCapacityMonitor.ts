import { interval, Observable } from 'rxjs';
import { map, filter, distinctUntilChanged } from 'rxjs/operators';
import { AbstractMemoryMonitor } from '../../AbstractMemoryMonitor';
import { MemoryEvent, MemoryEventType, IMemoryMonitorConfig } from '../../events';
import { EphemeralMemory } from './EphemeralMemory';

interface EphemeralCapacityConfig extends IMemoryMonitorConfig {
    /** Capacity threshold percentage (0-1) that triggers warnings */
    thresholdPercentage: number;
    /** Check interval in milliseconds */
    checkIntervalMs: number;
}

/**
 * Monitors the capacity of ephemeral memory and emits events when usage exceeds threshold
 */
export class EphemeralMemoryCapacityMonitor extends AbstractMemoryMonitor {
    private static readonly DEFAULT_CONFIG: EphemeralCapacityConfig = {
        enabled: true,
        thresholdPercentage: 0.8,  // 80% capacity triggers warning
        checkIntervalMs: 1000,     // Check every second
    };

    constructor(
        private ephemeralMemory: EphemeralMemory,
        config: Partial<EphemeralCapacityConfig> = {}
    ) {
        super(
            'ephemeral-capacity-monitor',
            { ...EphemeralMemoryCapacityMonitor.DEFAULT_CONFIG, ...config }
        );
    }

    /**
     * Monitor ephemeral memory capacity
     */
    public monitor(): Observable<MemoryEvent> {
        const config = this.config as EphemeralCapacityConfig;

        return interval(config.checkIntervalMs).pipe(
            // Get current capacity stats
            map(() => ({
                size: this.ephemeralMemory.size(),
                capacity: this.ephemeralMemory.capacity(),
                percentage: this.ephemeralMemory.size() / this.ephemeralMemory.capacity()
            })),
            // Only emit when over threshold
            filter(stats => stats.percentage > config.thresholdPercentage),
            // Only emit when values change significantly
            distinctUntilChanged((prev, curr) => 
                Math.abs(prev.percentage - curr.percentage) < 0.05  // 5% change threshold
            ),
            // Create capacity warning event
            map(stats => ({
                type: MemoryEventType.CAPACITY_WARNING,
                timestamp: new Date(),
                memory: null,
                metadata: new Map([
                    ['memoryType', 'ephemeral'],
                    ['currentSize', stats.size.toString()],
                    ['maxCapacity', stats.capacity.toString()],
                    ['usagePercentage', stats.percentage.toString()],
                    ['monitorId', this.id]
                ])
            }))
        );
    }

    /**
     * Get current capacity metrics
     */
    public getCapacityMetrics() {
        return {
            currentSize: this.ephemeralMemory.size(),
            maxCapacity: this.ephemeralMemory.capacity(),
            usagePercentage: this.ephemeralMemory.size() / this.ephemeralMemory.capacity()
        };
    }
}
