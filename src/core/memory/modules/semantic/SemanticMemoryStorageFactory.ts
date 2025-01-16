import { InMemoryStorage } from '../../storage/InMemoryStorage';
import { InMemoryIndex } from '../../storage/InMemoryIndex';
import { SemanticMemory } from './SemanticMemory';

/**
 * Factory for creating semantic memory with appropriate storage
 */
export class SemanticMemoryStorageFactory {
    static create(options: { maxCapacity?: number } = {}): SemanticMemory {
        const { maxCapacity = 1000 } = options;
        const storage = new InMemoryStorage(maxCapacity);
        const index = new InMemoryIndex();
        
        return new SemanticMemory(storage, index);
    }
}
