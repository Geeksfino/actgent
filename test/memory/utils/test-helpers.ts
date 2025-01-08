import { IMemoryStorage, IMemoryIndex, IMemoryUnit, MemoryFilter, MemoryType } from '../../../src/core/memory/types';

export class MockMemoryStorage implements IMemoryStorage {
    private memories: Map<string, IMemoryUnit> = new Map();

    async store(memory: IMemoryUnit): Promise<void> {
        this.memories.set(memory.id, memory);
    }

    async retrieve(id: string): Promise<IMemoryUnit | null> {
        return this.memories.get(id) || null;
    }

    async retrieveByFilter(filter: MemoryFilter): Promise<IMemoryUnit[]> {
        return Array.from(this.memories.values()).filter(memory => {
            if (filter.types && !filter.types.includes(memory.metadata.get('type') as MemoryType)) {
                return false;
            }

            if (filter.metadataFilters) {
                for (const metadataFilter of filter.metadataFilters) {
                    for (const [key, value] of metadataFilter.entries()) {
                        if (memory.metadata.get(key) !== value) {
                            return false;
                        }
                    }
                }
            }

            return true;
        });
    }

    async update(memory: IMemoryUnit): Promise<void> {
        this.memories.set(memory.id, memory);
    }

    async delete(id: string): Promise<void> {
        this.memories.delete(id);
    }

    async clear(): Promise<void> {
        this.memories.clear();
    }

    async batchStore(memories: IMemoryUnit[]): Promise<void> {
        for (const memory of memories) {
            await this.store(memory);
        }
    }

    async batchRetrieve(ids: string[]): Promise<(IMemoryUnit | null)[]> {
        return Promise.all(ids.map(id => this.retrieve(id)));
    }
}

export class MockMemoryIndex implements IMemoryIndex {
    async add(memory: IMemoryUnit): Promise<void> {
        // No-op for mock
    }

    async index(memory: IMemoryUnit): Promise<void> {
        return this.add(memory);  // Alias for add
    }

    async search(query: string): Promise<string[]> {
        return [];
    }

    async update(memory: IMemoryUnit): Promise<void> {
        // No-op for mock
    }

    async remove(id: string): Promise<void> {
        // No-op for mock
    }

    async batchIndex(memories: IMemoryUnit[]): Promise<void> {
        // No-op for mock
    }
}
