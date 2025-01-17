import { Observable } from 'rxjs';
import { AbstractMemoryMonitor } from '../../AbstractMemoryMonitor';
import { MonitorConfig, MonitorSignalType } from '../../monitors';
import { MemoryEvent } from '../../events';
import { EphemeralMemory } from './EphemeralMemory';
import { logger } from '../../../Logger';

export interface EphemeralCapacityMonitorConfig {
    maxItems: number;
    warningThreshold: number;  // Value between 0 and 1, representing percentage of capacity
}

/**
 * Monitors ephemeral memory capacity and emits warnings when thresholds are reached.
 * 
 * The monitor tracks the number of items in ephemeral memory and compares it against
 * a configured maximum capacity. When the ratio of current items to maximum items
 * exceeds the warning threshold, it emits a capacity warning event.
 * 
 * Example:
 * - maxItems: 1000
 * - warningThreshold: 0.8 (80%)
 * - Warning emitted when current items ≥ 800
 */
export class EphemeralMemoryCapacityMonitor extends AbstractMemoryMonitor {
    constructor(
        id: string,
        private readonly ephemeralMemory: EphemeralMemory,
        monitorConfig: EphemeralCapacityMonitorConfig
    ) {
        // Validate threshold
        if (monitorConfig.warningThreshold <= 0 || monitorConfig.warningThreshold > 1) {
            throw new Error('Warning threshold must be between 0 and 1');
        }
        
        const transitionConfig: MonitorConfig = {
            enabled: true,
            signal: MonitorSignalType.CAPACITY_THRESHOLD,
            priority: 1,
            signalConfig: {
                capacityThreshold: {
                    threshold: monitorConfig.warningThreshold,
                    current: 0,  // Will be updated during monitoring
                    max: monitorConfig.maxItems
                }
            }
        };
        super(id, transitionConfig);
        logger.info(
            'Created EphemeralMemoryCapacityMonitor with config: %o',
            { threshold: monitorConfig.warningThreshold, maxItems: monitorConfig.maxItems }
        );
    }

    /**
     * Called by TransitionManager when capacity threshold signal is received
     */
    public monitor(): Observable<MemoryEvent> {
        return new Observable<MemoryEvent>(subscriber => {
            try {
                logger.debug('EphemeralMemoryCapacityMonitor.monitor() called');

                // Get current capacity
                const currentSize = this.ephemeralMemory.size();
                const maxSize = this.ephemeralMemory.capacity();
                const threshold = this.config.signalConfig.capacityThreshold?.threshold ?? 0;
                const currentRatio = currentSize / maxSize;
                
                logger.info(
                    `[Monitor:${this.id}] Current state - Size: ${currentSize}/${maxSize}, Ratio: ${(currentRatio * 100).toFixed(2)}%, Threshold: ${(threshold * 100).toFixed(2)}%`
                );

                // Update current capacity in config
                if (this.config.signalConfig.capacityThreshold) {
                    this.config.signalConfig.capacityThreshold.current = currentSize;
                    this.config.signalConfig.capacityThreshold.max = maxSize;  // Also update max size
                    logger.debug(
                        `[Monitor:${this.id}] Updated capacity in config to ${currentSize}/${maxSize}`
                    );
                }

                // Check if we need to emit warning
                if (currentRatio >= threshold) {
                    logger.warn(
                        `[Monitor:${this.id}] ⚠️ Capacity threshold exceeded! Current: ${(currentRatio * 100).toFixed(2)}%, Threshold: ${(threshold * 100).toFixed(2)}%`
                    );

                    const event: MemoryEvent = {
                        type: 'system:warn:capacity',
                        memory: null,
                        timestamp: new Date(),
                        metadata: new Map([
                            ['capacity', {
                                current: currentSize,
                                max: maxSize,
                                threshold: threshold,
                                ratio: currentRatio,
                                percentage: Math.round(currentRatio * 100),
                                monitor: this.id
                            }]
                        ])
                    };

                    logger.info(
                        `[Monitor:${this.id}] Emitting capacity warning event with metadata:`,
                        Object.fromEntries(event.metadata!)
                    );

                    subscriber.next(event);
                } else {
                    logger.debug(
                        `[Monitor:${this.id}] Capacity within limits (${(currentRatio * 100).toFixed(2)}% < ${(threshold * 100).toFixed(2)}%)`
                    );
                }

                subscriber.complete();
            } catch (error) {
                logger.error(`[Monitor:${this.id}] Error in monitor:`, error);
                this.metrics.custom = this.metrics.custom || {};
                this.metrics.custom.lastError = error;
                subscriber.error(error);
            }
        });
    }
}
