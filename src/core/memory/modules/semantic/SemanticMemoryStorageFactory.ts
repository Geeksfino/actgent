import { SemanticMemory } from './SemanticMemory';
import { InMemoryGraphStorage } from '../../graph/data/InMemoryGraphStorage';
import { InMemoryGraphIndex } from '../../graph/data/InMemoryGraphIndex';
import { DeterministicIdGenerator } from '../../graph/id/DeterministicIdGenerator';

/**
 * Factory for creating semantic memory instances with appropriate storage
 */
export class SemanticMemoryStorageFactory {
    static create(): SemanticMemory {
        const storage = new InMemoryGraphStorage(new DeterministicIdGenerator());
        const index = new InMemoryGraphIndex();
        return new SemanticMemory(storage, index);
    }
}
