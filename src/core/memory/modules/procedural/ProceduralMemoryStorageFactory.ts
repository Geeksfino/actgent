import { InMemoryStorage } from '../../storage/InMemoryStorage';
import { InMemoryIndex } from '../../storage/InMemoryIndex';
import { ProceduralMemory } from './ProceduralMemory';

/**
 * Factory for creating procedural memory with appropriate storage
 */
export class ProceduralMemoryStorageFactory {
    static create(options: { maxCapacity?: number } = {}): ProceduralMemory {
        const { maxCapacity = 1000 } = options;
        const storage = new InMemoryStorage(maxCapacity);
        const index = new InMemoryIndex();
        
        return new ProceduralMemory(storage, index);
    }
}
