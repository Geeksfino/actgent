import { IMemoryUnit, MemoryType, SessionMemoryContext, EmotionalState, IMemoryStorage, IMemoryIndex, MemoryFilter } from '../../../src/core/memory/types';

export function createTestMemory(overrides: Partial<IMemoryUnit> = {}): IMemoryUnit {
    return {
        id: crypto.randomUUID(),
        content: 'test content',
        metadata: new Map(),
        timestamp: new Date(),
        memoryType: MemoryType.WORKING,
        accessCount: 0,
        lastAccessed: new Date(),
        ...overrides
    };
}

export function createTestContext(overrides: Partial<SessionMemoryContext> = {}): SessionMemoryContext {
    return {
        contextType: 'context_change',
        timestamp: new Date(),
        userGoals: new Set(),
        domainContext: new Map(),
        interactionHistory: [],
        emotionalTrends: [],
        emotionalState: { valence: 0, arousal: 0 },
        topicHistory: [],
        userPreferences: new Map(),
        interactionPhase: 'introduction',
        ...overrides
    };
}

export function createEmotionalState(overrides: Partial<EmotionalState> = {}): EmotionalState {
    return {
        valence: 0,
        arousal: 0,
        ...overrides
    };
}

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function compareMemories(memory1: IMemoryUnit, memory2: IMemoryUnit): boolean {
    const lastAccessedMatch = 
        (!memory1.lastAccessed && !memory2.lastAccessed) ||
        (memory1.lastAccessed?.getTime() === memory2.lastAccessed?.getTime());

    return (
        memory1.id === memory2.id &&
        memory1.content === memory2.content &&
        memory1.memoryType === memory2.memoryType &&
        memory1.accessCount === memory2.accessCount &&
        memory1.timestamp.getTime() === memory2.timestamp.getTime() &&
        lastAccessedMatch &&
        compareMetadata(memory1.metadata, memory2.metadata)
    );
}

function compareMetadata(map1: Map<string, any>, map2: Map<string, any>): boolean {
    if (map1.size !== map2.size) return false;
    for (const [key, value] of map1) {
        if (!map2.has(key)) return false;
        const value2 = map2.get(key);
        if (value instanceof Map) {
            if (!(value2 instanceof Map) || !compareMetadata(value, value2)) {
                return false;
            }
        } else if (value instanceof Set) {
            if (!(value2 instanceof Set) || !compareSets(value, value2)) {
                return false;
            }
        } else if (value instanceof Date) {
            if (!(value2 instanceof Date) || value.getTime() !== value2.getTime()) {
                return false;
            }
        } else if (value !== value2) {
            return false;
        }
    }
    return true;
}

function compareSets<T>(set1: Set<T>, set2: Set<T>): boolean {
    if (set1.size !== set2.size) return false;
    for (const item of set1) {
        if (!set2.has(item)) return false;
    }
    return true;
}

export class MockMemoryStorage implements IMemoryStorage {
    private memoryStore = new Map<string, IMemoryUnit>();
    private maxCapacity = 1000;

    async store(memory: IMemoryUnit): Promise<void> {
        this.memoryStore.set(memory.id, memory);
    }

    async retrieve(id: string): Promise<IMemoryUnit | null> {
        const memory = this.memoryStore.get(id);
        return memory || null;
    }

    async retrieveByFilter(filter: MemoryFilter): Promise<IMemoryUnit[]> {
        return Array.from(this.memoryStore.values());
    }

    async update(memory: IMemoryUnit): Promise<void> {
        this.memoryStore.set(memory.id, memory);
    }

    async delete(id: string): Promise<void> {
        this.memoryStore.delete(id);
    }

    async clear(): Promise<void> {
        this.memoryStore.clear();
    }

    getSize(): number {
        return this.memoryStore.size;
    }

    getCapacity(): number {
        return this.maxCapacity;
    }
}

export class MockMemoryIndex implements IMemoryIndex {
    private indexMap = new Map<string, Set<string>>();

    async index(memory: IMemoryUnit): Promise<void> {
        const key = memory.content.toString();
        if (!this.indexMap.has(key)) {
            this.indexMap.set(key, new Set());
        }
        this.indexMap.get(key)?.add(memory.id);
    }

    async add(memory: IMemoryUnit): Promise<void> {
        await this.index(memory);
    }

    async update(memory: IMemoryUnit): Promise<void> {
        await this.index(memory);
    }

    async delete(id: string): Promise<void> {
        for (const ids of this.indexMap.values()) {
            ids.delete(id);
        }
    }

    async search(query: string): Promise<string[]> {
        return Array.from(this.indexMap.values()).flatMap(set => Array.from(set));
    }
}
