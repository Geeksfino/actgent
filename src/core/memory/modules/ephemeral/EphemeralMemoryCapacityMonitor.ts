import { Observable } from 'rxjs';
import { AbstractMemoryMonitor } from '../../AbstractMemoryMonitor';
import { MonitorConfig, MonitorSignalType } from '../../monitors';
import { MemoryEvent } from '../../events';
import { EphemeralMemory } from './EphemeralMemory';

export interface EphemeralCapacityMonitorConfig {
    maxItems: number;
    warningThreshold: number;
}

/**
 * Monitors ephemeral memory capacity and emits warnings when thresholds are reached
 */
export class EphemeralMemoryCapacityMonitor extends AbstractMemoryMonitor {
    constructor(
        id: string,
        private readonly ephemeralMemory: EphemeralMemory,
        monitorConfig: EphemeralCapacityMonitorConfig
    ) {
        const transitionConfig: MonitorConfig = {
            enabled: true,
            trigger: MonitorSignalType.CAPACITY_THRESHOLD,
            priority: 1,
            signalConfig: {
                capacityThreshold: {
                    threshold: monitorConfig.warningThreshold,
                    current: 0,
                    max: monitorConfig.maxItems
                }
            }
        };
        super(id, transitionConfig);
    }

    /**
     * Called by TransitionManager when capacity threshold signal is received
     */
    public monitor(): Observable<MemoryEvent> {
        return new Observable<MemoryEvent>(subscriber => {
            try {
                // Get current capacity
                const currentSize = this.ephemeralMemory.size();
                const maxSize = this.config.signalConfig.capacityThreshold?.max ?? 0;
                const threshold = this.config.signalConfig.capacityThreshold?.threshold ?? 0;
                
                // Update current capacity in config
                if (this.config.signalConfig.capacityThreshold) {
                    this.config.signalConfig.capacityThreshold.current = currentSize;
                }

                // Check if we need to emit warning
                if (currentSize >= threshold) {
                    subscriber.next({
                        type: 'system:warn:capacity',
                        memory: null,
                        timestamp: new Date(),
                        metadata: new Map([
                            ['current', currentSize],
                            ['max', maxSize],
                            ['threshold', threshold]
                        ])
                    });
                }

                subscriber.complete();
            } catch (error) {
                subscriber.error(error);
            }
        });
    }
}
