import { WorkingMemory } from './WorkingMemory';
import { EpisodicMemory } from './EpisodicMemory';
import { IMemoryStorage, IMemoryIndex, MemoryType } from './types';

export class MemoryContextManager {
    private currentContext: Map<string, any>;
    private workingMemory: WorkingMemory;
    private episodicMemory: EpisodicMemory;

    constructor(storage: IMemoryStorage, index: IMemoryIndex) {
        this.currentContext = new Map();
        this.workingMemory = new WorkingMemory(storage, index);
        this.episodicMemory = new EpisodicMemory(storage, index);
    }

    setContext(key: string, value: any): void {
        this.currentContext.set(key, value);
        
        // Store context in working memory
        this.workingMemory.store(
            { [key]: value },
            new Map<string, any>([
                ['type', MemoryType.CONTEXTUAL],
                ['contextKey', key]
            ])
        ).catch(console.error);
    }

    getContext(key: string): any {
        return this.currentContext.get(key);
    }

    async getAllContext(): Promise<Map<string, any>> {
        return new Map(this.currentContext);
    }

    clearContext(): void {
        this.currentContext.clear();
    }

    async persistContext(): Promise<void> {
        // Store all current context in episodic memory
        await this.episodicMemory.store(
            Object.fromEntries(this.currentContext),
            new Map<string, any>([
                ['type', MemoryType.CONTEXTUAL],
                ['timestamp', new Date().toISOString()]
            ])
        );
    }

    async loadContext(filter: any): Promise<void> {
        const memories = await this.episodicMemory.retrieve({
            types: [MemoryType.CONTEXTUAL],
            ...filter
        });

        // Load the most recent context state
        if (memories.length > 0) {
            const latestMemory = memories.reduce((latest, current) => 
                latest.timestamp > current.timestamp ? latest : current
            );

            if (typeof latestMemory.content === 'object') {
                Object.entries(latestMemory.content).forEach(([key, value]) => {
                    this.setContext(key, value);
                });
            }
        }
    }

    async getContextHistory(): Promise<any[]> {
        return this.episodicMemory.retrieve({
            types: [MemoryType.CONTEXTUAL]
        });
    }

    async storeContextAsEpisodicMemory(metadata?: Map<string, any>): Promise<void> {
        const contextSnapshot = Array.from(this.currentContext.entries()).reduce(
            (acc, [key, value]) => ({ ...acc, [key]: value }),
            {}
        );

        const defaultMetadata = new Map<string, any>([
            ['type', MemoryType.CONTEXTUAL],
            ['timestamp', new Date().toISOString()],
            ['location', 'system'],
            ['actors', ['system']],
            ['actions', ['context_snapshot']]
        ]);

        const mergedMetadata = new Map<string, any>([
            ...Array.from(defaultMetadata.entries()),
            ...(metadata ? Array.from(metadata.entries()) : [])
        ]);

        await this.episodicMemory.store(contextSnapshot, mergedMetadata);
    }

    cleanup(): void {
        this.workingMemory.stopCleanupTimer();
    }
}
