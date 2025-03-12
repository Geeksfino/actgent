import { InMemoryStorage } from '../../storage/InMemoryStorage';
import { InMemoryIndex } from '../../storage/InMemoryIndex';
import { EpisodicMemory } from './EpisodicMemory';

/**
 * Factory for creating episodic memory with appropriate storage
 */
export class EpisodicMemoryStorageFactory {
    static create(options: { maxCapacity?: number } = {}): EpisodicMemory {
        const { maxCapacity = 1000 } = options;
        const storage = new InMemoryStorage(maxCapacity);
        const index = new InMemoryIndex();
        
        return new EpisodicMemory(storage, index);
    }
}
