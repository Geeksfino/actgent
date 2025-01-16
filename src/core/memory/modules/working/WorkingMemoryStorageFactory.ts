import { InMemoryStorage } from '../../storage/InMemoryStorage';
import { InMemoryIndex } from '../../storage/InMemoryIndex';
import { WorkingMemory } from './WorkingMemory';

/**
 * Factory for creating working memory with appropriate storage
 */
export class WorkingMemoryStorageFactory {
    static create(options: { maxCapacity?: number } = {}): WorkingMemory {
        const { maxCapacity = 1000 } = options;
        const storage = new InMemoryStorage(maxCapacity);
        const index = new InMemoryIndex();
        
        return new WorkingMemory(storage, index);
    }
}
