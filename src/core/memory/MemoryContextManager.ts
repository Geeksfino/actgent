import { WorkingMemory } from './WorkingMemory';
import { EpisodicMemory } from './EpisodicMemory';
import { LongTermMemory } from './LongTermMemory';
import { IMemoryStorage, IMemoryIndex, MemoryType, MemoryFilter, IMemoryUnit, IMemoryContextManager } from './types';
import crypto from 'crypto';

const CACHE_TTL = 60 * 1000; // 1 minute

export class MemoryContextManager implements IMemoryContextManager {
    private storage: IMemoryStorage;
    private index: IMemoryIndex;
    private currentContext: Map<string, any> = new Map();
    private contextHistory: Map<string, { value: any, timestamp: number }[]> = new Map();
    private readonly MAX_HISTORY_SIZE = 10;
    private workingMemory: WorkingMemory;
    private episodicMemory: EpisodicMemory;
    private longTermMemory: LongTermMemory;
    private contextCache: Map<string, { value: any, timestamp: number }>;
    private listeners: ((key: string, value: any) => void)[];

    constructor(storage: IMemoryStorage, index: IMemoryIndex) {
        this.storage = storage;
        this.index = index;
        this.workingMemory = new WorkingMemory(storage, index);
        this.episodicMemory = new EpisodicMemory(storage, index);
        this.longTermMemory = new LongTermMemory(storage, index);
        this.contextCache = new Map();
        this.listeners = [];
    }

    async setContext(key: string, value: any): Promise<void> {
        // Update current context
        this.currentContext.set(key, value);

        // Update context history
        if (!this.contextHistory.has(key)) {
            this.contextHistory.set(key, []);
        }
        const history = this.contextHistory.get(key)!;
        history.push({ value, timestamp: Date.now() });
        if (history.length > this.MAX_HISTORY_SIZE) {
            history.shift(); // Remove oldest entry
        }

        // Store as contextual memory
        const metadata = new Map<string, any>([
            ['type', MemoryType.CONTEXTUAL],
            ['key', key],
            ['timestamp', Date.now()]
        ]);

        await this.storage.store({
            id: crypto.randomUUID(),
            content: { key, value },
            metadata,
            timestamp: new Date()
        });

        // Notify listeners
        this.notifyContextChange(key, value);
    }

    async getContext(key: string): Promise<any> {
        return this.currentContext.get(key);
    }

    async getAllContext(): Promise<Map<string, any>> {
        return new Map(this.currentContext);
    }

    async clearContext(): Promise<void> {
        this.currentContext.clear();
        this.contextHistory.clear();
        await this.storeContextAsEpisodicMemory(new Map());
    }

    async loadContextFromFilter(filter: MemoryFilter): Promise<void> {
        const memories = await this.storage.retrieveByFilter({
            ...filter,
            types: [MemoryType.CONTEXTUAL]
        });

        // Group memories by key and get most recent for each
        const contextByKey = new Map<string, { value: any, timestamp: number }>();
        for (const memory of memories) {
            const key = memory.metadata.get('key');
            const timestamp = memory.metadata.get('timestamp') || 0;
            
            if (!key) continue;

            if (!contextByKey.has(key) || contextByKey.get(key)!.timestamp < timestamp) {
                contextByKey.set(key, {
                    value: memory.content.value,
                    timestamp
                });
            }
        }

        // Update current context with loaded values
        for (const [key, { value }] of contextByKey) {
            this.currentContext.set(key, value);
        }
    }

    async storeContextAsEpisodicMemory(context: Map<string, any>): Promise<void> {
        const metadata = new Map<string, any>([
            ['type', MemoryType.EPISODIC],
            ['contextSnapshot', true],
            ['timestamp', Date.now()]
        ]);

        await this.storage.store({
            id: crypto.randomUUID(),
            content: Object.fromEntries(context),
            metadata,
            timestamp: new Date()
        });
    }

    async getContextHistory(key: string): Promise<{ value: any, timestamp: number }[]> {
        return this.contextHistory.get(key) || [];
    }

    async persistContext(): Promise<void> {
        // Store all current context in episodic memory
        await this.episodicMemory.store(
            Object.fromEntries(this.currentContext),
            new Map<string, any>([
                ['type', MemoryType.CONTEXTUAL],
                ['timestamp', new Date('2025-01-07T22:13:44+08:00').toISOString()]
            ])
        );
    }

    async retrieve(filter: MemoryFilter): Promise<IMemoryUnit[]> {
        const contextMemories = await this.storage.retrieveByFilter({
            ...filter,
            types: [...(filter.types || []), MemoryType.CONTEXTUAL]
        });

        // Sort by timestamp (most recent first)
        return contextMemories.sort((a, b) => {
            const aTime = a.metadata.get('timestamp') || 0;
            const bTime = b.metadata.get('timestamp') || 0;
            return bTime - aTime;
        });
    }

    private notifyContextChange(key: string, value: any): void {
        this.listeners.forEach(listener => {
            try {
                listener(key, value);
            } catch (error) {
                console.error('Error in context change listener:', error);
            }
        });
    }

    addContextChangeListener(listener: (key: string, value: any) => void): void {
        this.listeners.push(listener);
    }

    removeContextChangeListener(listener: (key: string, value: any) => void): void {
        const index = this.listeners.indexOf(listener);
        if (index !== -1) {
            this.listeners.splice(index, 1);
        }
    }

    cleanup(): void {
        this.workingMemory.stopCleanupTimer();
    }
}
