import { IMemoryStorage, IMemoryIndex, IGraphStorage, IGraphIndex } from '../../storage';
import { InMemoryGraphStorage } from '../../graph/storage/InMemoryGraphStorage';
import { InMemoryIndex } from '../../storage/InMemoryIndex';
import { EpisodicMemory } from './EpisodicMemory';

/**
 * Factory for creating episodic memory with appropriate storage
 */
export class EpisodicMemoryStorageFactory {
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

    static create(options: { maxCapacity?: number } = {}): EpisodicMemory {
        const { maxCapacity = 1000 } = options;
        const storage = EpisodicMemoryStorageFactory.createInMemoryStorage(maxCapacity);
        const index = EpisodicMemoryStorageFactory.createInMemoryIndex();
        
        return new EpisodicMemory(storage, index);
    }
}
