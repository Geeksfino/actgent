import { IMemoryUnit } from './base';
import { MemoryFilter } from './base';

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


