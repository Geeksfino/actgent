import { ITemporalMetadata } from './types';

/**
 * Temporal index for efficient time-based queries
 */
export class TemporalIndex {
    private eventIndex: Map<string, Date>;     // nodeId -> eventTime
    private ingestionIndex: Map<string, Date>; // nodeId -> ingestionTime
    private validityIndex: Map<string, { from: Date; to?: Date }>;

    constructor() {
        this.eventIndex = new Map();
        this.ingestionIndex = new Map();
        this.validityIndex = new Map();
    }

    /**
     * Add or update temporal metadata for a node
     */
    addNode(nodeId: string, temporal: ITemporalMetadata): void {
        this.eventIndex.set(nodeId, temporal.eventTime);
        this.ingestionIndex.set(nodeId, temporal.ingestionTime);
        
        if (temporal.validFrom) {
            this.validityIndex.set(nodeId, {
                from: temporal.validFrom,
                to: temporal.validTo
            });
        }
    }

    /**
     * Find nodes within a time range
     */
    findNodesInRange(start: Date, end: Date, timelineType: 'event' | 'ingestion' = 'event'): string[] {
        const index = timelineType === 'event' ? this.eventIndex : this.ingestionIndex;
        
        return Array.from(index.entries())
            .filter(([_, time]) => time >= start && time <= end)
            .map(([id, _]) => id);
    }

    /**
     * Get nodes valid at a specific point in time
     */
    findValidNodes(at: Date): string[] {
        return Array.from(this.validityIndex.entries())
            .filter(([_, validity]) => {
                const isAfterStart = at >= validity.from;
                const isBeforeEnd = !validity.to || at <= validity.to;
                return isAfterStart && isBeforeEnd;
            })
            .map(([id, _]) => id);
    }

    /**
     * Remove a node from all temporal indices
     */
    removeNode(nodeId: string): void {
        this.eventIndex.delete(nodeId);
        this.ingestionIndex.delete(nodeId);
        this.validityIndex.delete(nodeId);
    }

    /**
     * Clear all indices
     */
    clear(): void {
        this.eventIndex.clear();
        this.ingestionIndex.clear();
        this.validityIndex.clear();
    }
}
