import { IMemoryUnit } from './base';
import { MemoryFilter } from './base';
import { IGraphNode, IGraphEdge, GraphFilter } from './graph/types';

/**
 * Interface for memory retrieval operations
 */
export interface IMemoryRetrieval {
    query(filter: MemoryFilter): Promise<IMemoryUnit[]>;
    exists(id: string): Promise<boolean>;
    getAssociatedMemories(id: string): Promise<IMemoryUnit[]>;
}

/**
 * Interface for memory storage operations
 */
export interface IMemoryStorage {
    store(memory: IMemoryUnit): Promise<void>;
    retrieve(id: string): Promise<IMemoryUnit | null>;
    retrieveByFilter(filter: MemoryFilter): Promise<IMemoryUnit[]>;
    update(memory: IMemoryUnit): Promise<void>;
    delete(id: string): Promise<void>;
    getSize(): number;
    getCapacity(): number;
    add(id: string, memory: IMemoryUnit): Promise<void>;
    get(id: string): Promise<IMemoryUnit | null>;
    remove(id: string): Promise<void>;
    clear(): Promise<void>;
    getAll(): Promise<IMemoryUnit[]>;
}

/**
 * Interface for memory indexing operations
 */
export interface IMemoryIndex {
    index?: (memory: IMemoryUnit) => Promise<void>;
    add(memory: IMemoryUnit): Promise<void>;
    search(query: string): Promise<string[]>;
    update(memory: IMemoryUnit): Promise<void>;
    delete(id: string): Promise<void>;
    remove(id: string): Promise<void>;
}

/**
 * Interface for graph storage operations
 */
export interface IGraphStorage extends IMemoryStorage {
    // Node operations
    addNode(node: IGraphNode): Promise<string>;
    getNode(id: string): Promise<IGraphNode | null>;
    updateNode(id: string, node: Partial<IGraphNode>): Promise<void>;
    findNodes(filter: GraphFilter): Promise<IGraphNode[]>;
    getNeighbors(nodeId: string): Promise<IGraphNode[]>;
    
    // Edge operations
    addEdge(edge: IGraphEdge): Promise<string>;
    getEdges(nodeIds: string[]): Promise<IGraphEdge[]>;
    findPath(sourceId: string, targetId: string): Promise<IGraphEdge[]>;
    
    // Search operations
    search(embedding: number[]): Promise<IGraphNode[]>;
}

/**
 * Interface for graph indexing operations
 */
export interface IGraphIndex extends IMemoryIndex {
    // Graph-specific indexing
    indexNode(node: IGraphNode): Promise<void>;
    indexEdge(edge: IGraphEdge): Promise<void>;
    searchByEmbedding(embedding: number[]): Promise<string[]>;
    searchByDistance(centerId: string, maxDistance: number): Promise<string[]>;
}
