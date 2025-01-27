import { EpisodicMemory } from './EpisodicMemory';
import { InMemoryGraphStorage } from '../../graph/data/InMemoryGraphStorage';
import { InMemoryGraphIndex } from '../../graph/data/InMemoryGraphIndex';

/**
 * Factory for creating episodic memory instances with appropriate storage
 */
export class EpisodicMemoryStorageFactory {
    static create(): EpisodicMemory {
        const storage = new InMemoryGraphStorage();
        const index = new InMemoryGraphIndex();
        return new EpisodicMemory(storage, index);
    }
}
