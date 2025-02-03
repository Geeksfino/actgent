import { IGraphNode, IGraphEdge, IGraphStorage } from '../../data/types';

/**
 * Temporal modes for querying graph state
 */
export enum TimeMode {
    SYSTEM = 'system',    // When we knew about it
    EPISODE = 'episode',  // When it happened in the episode
    BOTH = 'both'        // Consider both system and episode time
}

/**
 * Temporal index for efficient time-based queries
 */
export class TemporalIndex {
    private nodeIndex = {
        byCreatedAt: new Map<string, Date>(),
        byExpiredAt: new Map<string, Date>(),
        byValidAt: new Map<string, Date>()
    };

    private edgeIndex = {
        byCreatedAt: new Map<string, Date>(),
        byExpiredAt: new Map<string, Date>(),
        byValidAt: new Map<string, Date>(),
        byInvalidAt: new Map<string, Date>()
    };

    /**
     * Index a node's temporal information
     */
    indexNode(node: IGraphNode): void {
        const { id, createdAt, expiredAt, validAt } = node;
        
        this.nodeIndex.byCreatedAt.set(id, createdAt);
        if (expiredAt) this.nodeIndex.byExpiredAt.set(id, expiredAt);
        if (validAt) this.nodeIndex.byValidAt.set(id, validAt);
    }

    /**
     * Index an edge's temporal information
     */
    indexEdge(edge: IGraphEdge): void {
        const { id, createdAt, expiredAt, validAt, invalidAt } = edge;
        
        this.edgeIndex.byCreatedAt.set(id, createdAt);
        if (expiredAt) this.edgeIndex.byExpiredAt.set(id, expiredAt);
        if (validAt) this.edgeIndex.byValidAt.set(id, validAt);
        if (invalidAt) this.edgeIndex.byInvalidAt.set(id, invalidAt);
    }

    /**
     * Clear all temporal indices
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

/**
 * Processor for handling temporal aspects of graph data
 */
export class TemporalProcessor {
    constructor(private storage: IGraphStorage) {}

    /**
     * Get node state at a specific system time
     */
    async getNodeAtSystemTime(nodeId: string, asOf: Date): Promise<IGraphNode | null> {
        const node = await this.storage.getNode(nodeId);
        if (!node) return null;

        if (node.createdAt > asOf || (node.expiredAt && node.expiredAt <= asOf)) {
            return null;
        }

        return node;
    }

    /**
     * Get node state at a specific episode time
     */
    async getNodeAtEpisodeTime(nodeId: string, validAt: Date): Promise<IGraphNode | null> {
        const node = await this.storage.getNode(nodeId);
        if (!node) return null;

        if (!node.validAt || node.validAt > validAt) {
            return null;
        }

        return node;
    }

    /**
     * Get edge state at a specific system time
     */
    async getEdgeAtSystemTime(id: string, asOf: Date): Promise<IGraphEdge | null> {
        const edge = await this.storage.getEdge(id);
        if (!edge) return null;

        if (edge.createdAt > asOf || (edge.expiredAt && edge.expiredAt <= asOf)) {
            return null;
        }

        return edge;
    }

    /**
     * Get edge state at a specific episode time
     */
    async getEdgeAtEpisodeTime(id: string, validAt: Date): Promise<IGraphEdge | null> {
        const edge = await this.storage.getEdge(id);
        if (!edge) return null;

        if (!edge.validAt || edge.validAt > validAt || (edge.invalidAt && edge.invalidAt <= validAt) || (edge.expiredAt && edge.expiredAt <= validAt)) {
            return null;
        }

        return edge;
    }

    /**
     * Get node state based on temporal mode
     */
    async getNodeState(nodeId: string, mode: TimeMode, timestamp: Date): Promise<IGraphNode | null> {
        switch (mode) {
            case TimeMode.SYSTEM:
                return this.getNodeAtSystemTime(nodeId, timestamp);
            case TimeMode.EPISODE:
                return this.getNodeAtEpisodeTime(nodeId, timestamp);
            case TimeMode.BOTH: {
                const systemState = await this.getNodeAtSystemTime(nodeId, timestamp);
                if (!systemState) return null;
                return this.getNodeAtEpisodeTime(nodeId, timestamp);
            }
            default:
                throw new Error(`Unsupported temporal mode: ${mode}`);
        }
    }

    /**
     * Get edge state based on temporal mode
     */
    async getEdgeState(id: string, mode: TimeMode, timestamp: Date): Promise<IGraphEdge | null> {
        switch (mode) {
            case TimeMode.SYSTEM:
                return this.getEdgeAtSystemTime(id, timestamp);
            case TimeMode.EPISODE:
                return this.getEdgeAtEpisodeTime(id, timestamp);
            case TimeMode.BOTH: {
                const systemState = await this.getEdgeAtSystemTime(id, timestamp);
                if (!systemState) return null;
                return this.getEdgeAtEpisodeTime(id, timestamp);
            }
            default:
                throw new Error(`Unsupported temporal mode: ${mode}`);
        }
    }
}
