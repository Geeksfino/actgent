import { IMemoryStorage, IMemoryIndex } from './types';
import { AbstractMemory } from './AbstractMemory';
import { WorkingMemory } from './WorkingMemory';
import { EpisodicMemory } from './EpisodicMemory';
import { SemanticMemory } from './semantic/SemanticMemory';
import { ProceduralMemory } from './ProceduralMemory';
import { IConceptGraph } from './semantic/IConceptGraph';
import { ConceptGraph } from './semantic/ConceptGraph';

/**
 * Registry to manage singleton instances of memory types
 */
export class MemoryRegistry {
    private static instance: MemoryRegistry | null = null;
    private memories: Map<string, AbstractMemory> = new Map();
    private storage: IMemoryStorage;
    private index: IMemoryIndex;
    private conceptGraph: IConceptGraph;

    private constructor(storage: IMemoryStorage, index: IMemoryIndex) {
        this.storage = storage;
        this.index = index;
        this.conceptGraph = new ConceptGraph();
    }

    static initialize(storage: IMemoryStorage, index: IMemoryIndex): MemoryRegistry {
        if (!MemoryRegistry.instance) {
            MemoryRegistry.instance = new MemoryRegistry(storage, index);
        }
        return MemoryRegistry.instance;
    }

    static getInstance(): MemoryRegistry {
        if (!MemoryRegistry.instance) {
            throw new Error('MemoryRegistry not initialized');
        }
        return MemoryRegistry.instance;
    }

    getWorkingMemory(): WorkingMemory {
        return this.getOrCreate('working', () => new WorkingMemory(this.storage, this.index));
    }

    getEpisodicMemory(): EpisodicMemory {
        return this.getOrCreate('episodic', () => new EpisodicMemory(this.storage, this.index));
    }

    getSemanticMemory(): SemanticMemory {
        return this.getOrCreate('semantic', () => new SemanticMemory(this.storage, this.index, this.conceptGraph));
    }

    getProceduralMemory(): ProceduralMemory {
        return this.getOrCreate('procedural', () => new ProceduralMemory(this.storage, this.index));
    }

    private getOrCreate<T extends AbstractMemory>(key: string, factory: () => T): T {
        let memory = this.memories.get(key);
        if (!memory) {
            memory = factory();
            this.memories.set(key, memory);
        }
        return memory as T;
    }

    /**
     * Reset the registry (mainly for testing)
     */
    static reset(): void {
        if (MemoryRegistry.instance) {
            // Cleanup existing memories
            for (const memory of MemoryRegistry.instance.memories.values()) {
                memory.cleanup().catch(console.error);
            }
            MemoryRegistry.instance.memories.clear();
            MemoryRegistry.instance = null;
        }
    }
}
