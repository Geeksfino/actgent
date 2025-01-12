import { IMemoryUnit, IMemoryStorage, IMemoryIndex, MemoryType, MemoryFilter } from '../../src/core/memory/types';
import { WorkingMemory } from '../../src/core/memory/WorkingMemory';
import { EpisodicMemory } from '../../src/core/memory/EpisodicMemory';
import { Logger, LogLevel } from '../../src/core/Logger';

// Configure logger for tests
Logger.getInstance().setLevel(LogLevel.DEBUG);

export class MockMemoryStorage implements IMemoryStorage {
    private memoryStore = new Map<string, IMemoryUnit>();

    async store(memory: IMemoryUnit): Promise<void> {
        this.memoryStore.set(memory.id, structuredClone(memory));
    }

    async retrieve(id: string): Promise<IMemoryUnit | null> {
        const memory = this.memoryStore.get(id);
        return memory ? structuredClone(memory) : null;
    }

    async retrieveByFilter(filter: MemoryFilter): Promise<IMemoryUnit[]> {
        const memories = Array.from(this.memoryStore.values()).map(m => structuredClone(m));
        
        if (filter.id) {
            const memory = this.memoryStore.get(filter.id);
            return memory ? [structuredClone(memory)] : [];
        }
        
        if (filter.ids) {
            return memories.filter(m => filter.ids!.includes(m.id));
        }
        
        if (filter.types) {
            return memories.filter(m => filter.types!.includes(m.memoryType));
        }
        
        return memories;
    }

    async update(memory: IMemoryUnit): Promise<void> {
        if (!this.memoryStore.has(memory.id)) {
            throw new Error(`Memory unit ${memory.id} not found`);
        }
        this.memoryStore.set(memory.id, structuredClone(memory));
    }

    async delete(id: string): Promise<void> {
        this.memoryStore.delete(id);
    }

    getSize(): number {
        return this.memoryStore.size;
    }

    getCapacity(): number {
        return 1000;
    }
}

export class MockMemoryIndex implements IMemoryIndex {
    private indexMap = new Map<string, string[]>();

    async add(memory: IMemoryUnit): Promise<void> {
        // Simple indexing by content words
        const content = typeof memory.content === 'object' ? 
            JSON.stringify(memory.content) : 
            String(memory.content);
            
        const words = content.toLowerCase().split(/\W+/);
        for (const word of words) {
            if (!word) continue;
            const ids = this.indexMap.get(word) || [];
            if (!ids.includes(memory.id)) {
                ids.push(memory.id);
                this.indexMap.set(word, ids);
            }
        }
    }

    async search(query: string): Promise<string[]> {
        const words = query.toLowerCase().split(/\W+/);
        const results = new Set<string>();
        for (const word of words) {
            if (!word) continue;
            const ids = this.indexMap.get(word) || [];
            ids.forEach(id => results.add(id));
        }
        return Array.from(results);
    }

    async update(memory: IMemoryUnit): Promise<void> {
        await this.delete(memory.id);
        await this.add(memory);
    }

    async delete(id: string): Promise<void> {
        for (const [word, ids] of this.indexMap.entries()) {
            const filtered = ids.filter(memId => memId !== id);
            if (filtered.length === 0) {
                this.indexMap.delete(word);
            } else {
                this.indexMap.set(word, filtered);
            }
        }
    }
}

export function createTestMemory(content: any = { test: 'data' }): IMemoryUnit {
    const now = new Date();
    return {
        id: crypto.randomUUID(),
        content,
        metadata: new Map(),
        timestamp: now,
        memoryType: MemoryType.GENERIC,
        accessCount: 0,
        lastAccessed: now
    };
}

export function createMockWorkingMemory(): WorkingMemory {
    return new WorkingMemory(new MockMemoryStorage(), new MockMemoryIndex());
}

export function createMockEpisodicMemory(): EpisodicMemory {
    return new EpisodicMemory(new MockMemoryStorage(), new MockMemoryIndex());
}
