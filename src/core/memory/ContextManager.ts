import { WorkingMemory } from './WorkingMemory';
import { EpisodicMemory } from './EpisodicMemory';
import { IMemoryStorage, IMemoryIndex, MemoryType } from './types';

export class ContextManager {
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

    clearContext(): void {
        this.currentContext.clear();
    }

    async loadContext(): Promise<void> {
        const contextMemories = await this.workingMemory.retrieve({
            types: [MemoryType.CONTEXTUAL],
            metadataFilters: [new Map<string, any>([['type', MemoryType.CONTEXTUAL]])]
        });

        for (const memory of contextMemories) {
            const contextKey = memory.metadata.get('contextKey');
            if (contextKey) {
                const contextValue = Object.values(memory.content)[0];
                this.currentContext.set(contextKey, contextValue);
            }
        }
    }

    getAllContext(): Map<string, any> {
        return new Map(this.currentContext);
    }

    async persistContext(): Promise<void> {
        for (const [key, value] of this.currentContext) {
            await this.workingMemory.store(
                { [key]: value },
                new Map<string, any>([
                    ['type', MemoryType.CONTEXTUAL],
                    ['contextKey', key]
                ])
            );
        }
    }

    /**
     * Stores the current context as an episodic memory
     * This is useful for maintaining a history of important context changes
     */
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
