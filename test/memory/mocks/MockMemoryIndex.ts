import { IMemoryIndex, IMemoryUnit } from '../../../src/core/memory/types';

export class MockMemoryIndex implements IMemoryIndex {
    private indexMap: Map<string, Set<string>> = new Map();

    async add(memory: IMemoryUnit): Promise<void> {
        await this.index(memory);
    }

    async index(memory: IMemoryUnit): Promise<void> {
        const words = memory.content.toString().toLowerCase().split(/\s+/);
        for (const word of words) {
            if (!this.indexMap.has(word)) {
                this.indexMap.set(word, new Set());
            }
            this.indexMap.get(word)?.add(memory.id);
        }
    }

    async update(memory: IMemoryUnit): Promise<void> {
        await this.delete(memory.id);
        await this.index(memory);
    }

    async delete(id: string): Promise<void> {
        for (const ids of this.indexMap.values()) {
            ids.delete(id);
        }
    }

    async search(query: string): Promise<string[]> {
        const words = query.toLowerCase().split(/\s+/);
        const results = new Set<string>();
        
        for (const word of words) {
            const matches = this.indexMap.get(word);
            if (matches) {
                matches.forEach(id => results.add(id));
            }
        }
        
        return Array.from(results);
    }

    async clear(): Promise<void> {
        this.indexMap.clear();
    }
}
