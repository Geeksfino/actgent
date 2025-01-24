import { IMemoryStorage, IMemoryIndex, IGraphStorage, IGraphIndex } from '../../storage';
import { InMemoryGraphStorage } from '../../storage/InMemoryGraphStorage';
import { SemanticMemory } from './SemanticMemory';

/**
 * Factory for creating semantic memory storage
 */
export class SemanticMemoryStorageFactory {
    /**
     * Create a new in-memory storage instance
     */
    static createInMemoryStorage(maxCapacity: number = 1000): IGraphStorage {
        return new InMemoryGraphStorage(maxCapacity);
    }

    /**
     * Create a new in-memory index
     */
    static createInMemoryIndex(): IGraphIndex {
        // TODO: Implement proper graph index
        return {} as IGraphIndex;
    }

    /**
     * Create a semantic memory with storage
     */
    static create(options: { maxCapacity?: number } = {}): SemanticMemory {
        const { maxCapacity = 1000 } = options;
        const storage = SemanticMemoryStorageFactory.createInMemoryStorage(maxCapacity);
        const index = SemanticMemoryStorageFactory.createInMemoryIndex();
        
        return new SemanticMemory(storage, index);
    }
}
