import { IMemoryEventHandler, MemoryEvent, MemoryEventType } from '../../events';
import { WorkingMemory } from './WorkingMemory';
import { logger } from '../../../Logger';

/**
 * Event handler for working memory events.
 * Handles capacity warnings and triggers memory consolidation when needed.
 */
export class WorkingMemoryEventHandler implements IMemoryEventHandler {
    constructor(
        private readonly workingMemory: WorkingMemory,
        private readonly consolidationThreshold: number = 0.9 // 90% capacity triggers consolidation
    ) {
        if (consolidationThreshold <= 0 || consolidationThreshold > 1) {
            throw new Error('Consolidation threshold must be between 0 and 1');
        }
    }

    /**
     * Handle memory events
     * @param event The memory event to handle
     */
    async onEvent(event: MemoryEvent): Promise<void> {
        logger.info(
            '[Handler:WorkingMemory] Received event: %s',
            event.type
        );

        if (event.type === 'system:warn:capacity') {
            await this.handleCapacityWarning(event);
        } else {
            logger.debug(
                '[Handler:WorkingMemory] Ignoring unhandled event type: %s',
                event.type
            );
        }
    }

    /**
     * Get event types this handler can process
     */
    canHandleEventTypes(): MemoryEventType[] {
        return ['system:warn:capacity'];
    }

    /**
     * Handle capacity warning events
     * @param event The capacity warning event
     */
    private async handleCapacityWarning(event: MemoryEvent): Promise<void> {
        try {
            logger.debug('[Handler:WorkingMemory] Processing capacity warning event');

            // Get capacity info from event metadata
            const capacityInfo = event.metadata?.get('capacity');
            if (!capacityInfo) {
                logger.warn('[Handler:WorkingMemory] Capacity warning event missing capacity information');
                return;
            }

            logger.info(
                '[Handler:WorkingMemory] Capacity warning from monitor %s - Current: %d/%d (%d%%)',
                capacityInfo.monitor,
                capacityInfo.current,
                capacityInfo.max,
                capacityInfo.percentage
            );

            // Check if we need to consolidate
            const currentRatio = capacityInfo.ratio as number;
            if (currentRatio >= this.consolidationThreshold) {
                logger.warn(
                    '[Handler:WorkingMemory] 🔄 Starting memory consolidation (%.2f%% >= %.2f%%)',
                    currentRatio * 100,
                    this.consolidationThreshold * 100
                );

                // Get all items sorted by priority and access time
                const items = await this.workingMemory.getAll();
                logger.info('[Handler:WorkingMemory] Found %d items to process', items.length);
                
                // Group items by priority
                const priorityGroups = new Map<number, typeof items>();
                for (const item of items) {
                    const priority = item.metadata?.get('priority') as number || 0;
                    const group = priorityGroups.get(priority) || [];
                    group.push(item);
                    priorityGroups.set(priority, group);
                }

                logger.debug(
                    '[Handler:WorkingMemory] Grouped items by priority: %o',
                    Object.fromEntries(
                        Array.from(priorityGroups.entries()).map(([k, v]) => [k, v.length])
                    )
                );

                // Process each priority group
                for (const [priority, group] of priorityGroups) {
                    // Sort by last access time within priority group
                    group.sort((a, b) => 
                        (a.lastAccessed?.getTime() || 0) - (b.lastAccessed?.getTime() || 0)
                    );

                    // Remove oldest items in low priority groups
                    if (priority < 0.5) {  // Configurable threshold
                        const itemsToRemove = Math.ceil(group.length * 0.5);  // Remove 50%
                        const removeList = group.slice(0, itemsToRemove);
                        
                        logger.info(
                            '[Handler:WorkingMemory] Removing %d items from priority group %.2f',
                            itemsToRemove,
                            priority
                        );

                        for (const item of removeList) {
                            await this.workingMemory.delete(item.id);
                            logger.debug(
                                '[Handler:WorkingMemory] Removed item %s (priority: %.2f, last accessed: %s)',
                                item.id,
                                priority,
                                item.lastAccessed?.toISOString()
                            );
                        }
                    }
                }

                const newSize = await this.workingMemory.getCurrentSize();
                logger.info(
                    '[Handler:WorkingMemory] ✅ Consolidation complete. New size: %d/%d',
                    newSize,
                    this.workingMemory.getCapacity()
                );
            } else {
                logger.debug(
                    '[Handler:WorkingMemory] Consolidation not needed (%.2f%% < %.2f%%)',
                    currentRatio * 100,
                    this.consolidationThreshold * 100
                );
            }
        } catch (error) {
            logger.error('[Handler:WorkingMemory] Error handling capacity warning:', error);
            throw error;
        }
    }
}
