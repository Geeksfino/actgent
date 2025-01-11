import { IMemoryStorage, IMemoryUnit, MemoryFilter } from '../../../src/core/memory/types';

export class MockMemoryStorage implements IMemoryStorage {
    private storage: Map<string, IMemoryUnit> = new Map();

    async store(memory: IMemoryUnit): Promise<void> {
        this.storage.set(memory.id, memory);
    }

    async retrieve(id: string): Promise<IMemoryUnit | null> {
        return this.storage.get(id) || null;
    }

    async update(memory: IMemoryUnit): Promise<void> {
        if (!this.storage.has(memory.id)) {
            throw new Error('Memory not found');
        }
        this.storage.set(memory.id, memory);
    }

    async delete(id: string): Promise<void> {
        this.storage.delete(id);
    }

    async batchStore(memories: IMemoryUnit[]): Promise<void> {
        for (const memory of memories) {
            await this.store(memory);
        }
    }

    async batchRetrieve(ids: string[]): Promise<(IMemoryUnit | null)[]> {
        return Promise.all(ids.map(id => this.retrieve(id)));
    }

    async retrieveByFilter(filter: MemoryFilter): Promise<IMemoryUnit[]> {
        return Array.from(this.storage.values()).filter(memory => {
            if (filter.type && memory.metadata.get('type') !== filter.type) {
                return false;
            }
            if (filter.ids && !filter.ids.includes(memory.id)) {
                return false;
            }
            if (filter.metadata) {
                for (const [key, value] of filter.metadata) {
                    if (memory.metadata.get(key) !== value) {
                        return false;
                    }
                }
            }
            return true;
        });
    }

    async clear(): Promise<void> {
        this.storage.clear();
    }
}
