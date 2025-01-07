import { BaseMemorySystem } from './BaseMemorySystem';
import { EpisodicMemoryFactory } from './EpisodicMemoryFactory';
import { IMemoryUnit, IEpisodicMemoryUnit, MemoryFilter, IMemoryStorage, IMemoryIndex, MemoryType } from './types';

export class EpisodicMemory extends BaseMemorySystem {
    private factory: EpisodicMemoryFactory;

    constructor(storage: IMemoryStorage, index: IMemoryIndex) {
        super(storage, index);
        this.factory = new EpisodicMemoryFactory();
    }

    async store(content: any, metadata?: Map<string, any>): Promise<void> {
        const defaultMetadata = new Map<string, any>([
            ['type', MemoryType.EPISODIC],
            ['timestamp', new Date().toISOString()]
        ]);

        const mergedMetadata = new Map<string, any>([
            ...Array.from(defaultMetadata.entries()),
            ...(metadata ? Array.from(metadata.entries()) : [])
        ]);

        const memory: IMemoryUnit = {
            id: this.generateId(),
            timestamp: new Date(),
            content,
            metadata: mergedMetadata
        };

        await this.storage.store(memory);
        await this.index.index(memory);
        this.cache.set(memory.id, memory);
    }

    async retrieve(filter: MemoryFilter): Promise<IMemoryUnit[]> {
        // Convert legacy filter properties to new format
        const updatedFilter: MemoryFilter = {
            ...filter,
            types: [...(filter.types || []), MemoryType.EPISODIC],
            metadataFilters: [
                ...(filter.metadataFilters || []),
                new Map<string, any>([['type', MemoryType.EPISODIC]]),
                ...(filter.metadata ? [filter.metadata] : [])
            ],
            dateRange: filter.dateRange || (filter.startTime || filter.endTime ? {
                start: filter.startTime || new Date(0),
                end: filter.endTime || new Date()
            } : undefined)
        };

        const query = this.buildQuery(updatedFilter);
        const ids = await this.index.search(query);
        const memories: IMemoryUnit[] = [];

        for (const id of ids) {
            const cached = this.cache.get(id);
            if (cached) {
                memories.push(cached);
                continue;
            }

            const memory = await this.storage.retrieve(id);
            if (memory) {
                this.cache.set(id, memory);
                memories.push(memory);
            }
        }

        return memories;
    }

    async findSimilarExperiences(experience: IEpisodicMemoryUnit): Promise<IEpisodicMemoryUnit[]> {
        const filter: MemoryFilter = {
            metadata: new Map([['type', 'episodic']]),
            query: JSON.stringify({
                location: experience.location,
                actors: experience.actors,
                actions: experience.actions
            })
        };

        const memories = await this.retrieve(filter);
        return memories as IEpisodicMemoryUnit[];
    }

    private buildQuery(filter: MemoryFilter): string {
        const queryParts: string[] = [];

        if (filter.types?.length) {
            queryParts.push(`type:(${filter.types.join(' OR ')})`);
        }

        if (filter.dateRange) {
            if (filter.dateRange.start) {
                queryParts.push(`timestamp >= ${filter.dateRange.start.toISOString()}`);
            }
            if (filter.dateRange.end) {
                queryParts.push(`timestamp <= ${filter.dateRange.end.toISOString()}`);
            }
        }

        if (filter.ids?.length) {
            queryParts.push(`id:(${filter.ids.join(' OR ')})`);
        }

        if (filter.metadataFilters?.length) {
            for (const metadataFilter of filter.metadataFilters) {
                for (const [key, value] of metadataFilter.entries()) {
                    queryParts.push(`metadata.${key}:${value}`);
                }
            }
        }

        if (filter.contentFilters?.length) {
            for (const contentFilter of filter.contentFilters) {
                for (const [key, value] of contentFilter.entries()) {
                    queryParts.push(`content.${key}:${value}`);
                }
            }
        }

        if (filter.query) {
            queryParts.push(filter.query);
        }

        return queryParts.join(' AND ');
    }

    private buildEpisodicQuery(filter: MemoryFilter): string {
        const queryParts = [];

        if (filter.startTime) {
            queryParts.push(`timestamp >= ${filter.startTime.toISOString()}`);
        }
        if (filter.endTime) {
            queryParts.push(`timestamp <= ${filter.endTime.toISOString()}`);
        }
        if (filter.query) {
            queryParts.push(filter.query);
        }
        if (filter.metadata) {
            for (const [key, value] of filter.metadata) {
                queryParts.push(`metadata.${key}:${value}`);
            }
        }

        return queryParts.join(' AND ');
    }
}
