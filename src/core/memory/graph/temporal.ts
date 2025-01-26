import { IGraphNode, IGraphEdge, TemporalMode } from './types';

/**
 * Temporal index for efficient time-based queries
 */
export class TemporalIndex {
    private nodeIndex: {
        byCreatedAt: Map<string, Date>;
        byExpiredAt: Map<string, Date>;
        byValidAt: Map<string, Date>;
    };
    
    private edgeIndex: {
        byCreatedAt: Map<string, Date>;
        byExpiredAt: Map<string, Date>;
        byValidAt: Map<string, Date>;
        byInvalidAt: Map<string, Date>;
    };

    constructor() {
        this.nodeIndex = {
            byCreatedAt: new Map(),
            byExpiredAt: new Map(),
            byValidAt: new Map()
        };
        
        this.edgeIndex = {
            byCreatedAt: new Map(),
            byExpiredAt: new Map(),
            byValidAt: new Map(),
            byInvalidAt: new Map()
        };
    }

    /**
     * Add or update temporal metadata for a node
     */
    addNode(node: IGraphNode): void {
        const id = node.id;
        this.nodeIndex.byCreatedAt.set(id, node.createdAt);
        if (node.expiredAt) {
            this.nodeIndex.byExpiredAt.set(id, node.expiredAt);
        }
        if (node.validAt) {
            this.nodeIndex.byValidAt.set(id, node.validAt);
        }
    }

    /**
     * Add or update temporal metadata for an edge
     */
    addEdge(edge: IGraphEdge): void {
        const id = edge.id;
        this.edgeIndex.byCreatedAt.set(id, edge.createdAt);
        if (edge.expiredAt) {
            this.edgeIndex.byExpiredAt.set(id, edge.expiredAt);
        }
        if (edge.validAt) {
            this.edgeIndex.byValidAt.set(id, edge.validAt);
        }
        if (edge.invalidAt) {
            this.edgeIndex.byInvalidAt.set(id, edge.invalidAt);
        }
    }

    /**
     * Find nodes valid at a specific point in time
     */
    findValidNodes(at: Date, mode: TemporalMode = TemporalMode.BUSINESS_TIME): string[] {
        switch (mode) {
            case TemporalMode.SYSTEM_TIME:
                return Array.from(this.nodeIndex.byCreatedAt.entries())
                    .filter(([id, created]) => {
                        const expired = this.nodeIndex.byExpiredAt.get(id);
                        return created <= at && (!expired || expired > at);
                    })
                    .map(([id, _]) => id);
                
            case TemporalMode.BUSINESS_TIME:
                return Array.from(this.nodeIndex.byValidAt.entries())
                    .filter(([_, validAt]) => validAt <= at)
                    .map(([id, _]) => id);
                
            case TemporalMode.BI_TEMPORAL:
                return Array.from(this.nodeIndex.byCreatedAt.entries())
                    .filter(([id, created]) => {
                        const expired = this.nodeIndex.byExpiredAt.get(id);
                        const validAt = this.nodeIndex.byValidAt.get(id);
                        return created <= at && 
                               (!expired || expired > at) &&
                               (!validAt || validAt <= at);
                    })
                    .map(([id, _]) => id);
        }
    }

    /**
     * Find edges valid at a specific point in time
     */
    findValidEdges(at: Date, mode: TemporalMode = TemporalMode.BUSINESS_TIME): string[] {
        switch (mode) {
            case TemporalMode.SYSTEM_TIME:
                return Array.from(this.edgeIndex.byCreatedAt.entries())
                    .filter(([id, created]) => {
                        const expired = this.edgeIndex.byExpiredAt.get(id);
                        return created <= at && (!expired || expired > at);
                    })
                    .map(([id, _]) => id);
                
            case TemporalMode.BUSINESS_TIME:
                return Array.from(this.edgeIndex.byValidAt.entries())
                    .filter(([id, validAt]) => {
                        const invalidAt = this.edgeIndex.byInvalidAt.get(id);
                        return validAt <= at && (!invalidAt || invalidAt > at);
                    })
                    .map(([id, _]) => id);
                
            case TemporalMode.BI_TEMPORAL:
                return Array.from(this.edgeIndex.byCreatedAt.entries())
                    .filter(([id, created]) => {
                        const expired = this.edgeIndex.byExpiredAt.get(id);
                        const validAt = this.edgeIndex.byValidAt.get(id);
                        const invalidAt = this.edgeIndex.byInvalidAt.get(id);
                        return created <= at && 
                               (!expired || expired > at) &&
                               (!validAt || validAt <= at) &&
                               (!invalidAt || invalidAt > at);
                    })
                    .map(([id, _]) => id);
        }
    }

    /**
     * Clear all indices
     */
    clear(): void {
        this.nodeIndex.byCreatedAt.clear();
        this.nodeIndex.byExpiredAt.clear();
        this.nodeIndex.byValidAt.clear();
        
        this.edgeIndex.byCreatedAt.clear();
        this.edgeIndex.byExpiredAt.clear();
        this.edgeIndex.byValidAt.clear();
        this.edgeIndex.byInvalidAt.clear();
    }
}
