import { IMemoryUnit,  IMemoryAssociation } from './base';
import { IMemoryStorage, IMemoryIndex } from './storage';

export class MemoryAssociator implements IMemoryAssociation {
    private storage: IMemoryStorage;
    private index: IMemoryIndex;

    constructor(storage: IMemoryStorage, index: IMemoryIndex) {
        this.storage = storage;
        this.index = index;
    }

    async associate(sourceId: string, targetId: string): Promise<void> {
        const [sourceMemory, targetMemory] = await Promise.all([
            this.storage.retrieve(sourceId),
            this.storage.retrieve(targetId)
        ]);

        if (!sourceMemory || !targetMemory) {
            throw new Error('One or both memories not found');
        }

        // Initialize associations sets if they don't exist
        if (!sourceMemory.associations) sourceMemory.associations = new Set<string>();
        if (!targetMemory.associations) targetMemory.associations = new Set<string>();

        // Add bidirectional associations
        sourceMemory.associations.add(targetId);
        targetMemory.associations.add(sourceId);

        // Update both memories
        await Promise.all([
            this.storage.update(sourceMemory),
            this.storage.update(targetMemory)
        ]);

        // Update indices if index method exists
        if (this.index.index) {
            await Promise.all([
                this.index.index(sourceMemory),
                this.index.index(targetMemory)
            ]);
        }
    }

    async dissociate(sourceId: string, targetId: string): Promise<void> {
        const [sourceMemory, targetMemory] = await Promise.all([
            this.storage.retrieve(sourceId),
            this.storage.retrieve(targetId)
        ]);

        if (!sourceMemory || !targetMemory) {
            throw new Error('One or both memories not found');
        }

        // Remove associations
        if (sourceMemory.associations) {
            sourceMemory.associations.delete(targetId);
        }
        if (targetMemory.associations) {
            targetMemory.associations.delete(sourceId);
        }

        // Update both memories
        await Promise.all([
            this.storage.update(sourceMemory),
            this.storage.update(targetMemory)
        ]);

        // Update indices if index method exists
        if (this.index.index) {
            await Promise.all([
                this.index.index(sourceMemory),
                this.index.index(targetMemory)
            ]);
        }
    }

    async getAssociations(id: string): Promise<string[]> {
        const memory = await this.storage.retrieve(id);
        if (!memory) {
            throw new Error('Memory not found');
        }

        return memory.associations ? Array.from(memory.associations) : [];
    }

    async findRelatedMemories(id: string, maxResults: number = 10): Promise<IMemoryUnit[]> {
        const memory = await this.storage.retrieve(id);
        if (!memory) {
            throw new Error('Memory not found');
        }

        if (!memory.associations || memory.associations.size === 0) {
            return [];
        }

        // Get all directly associated memories
        const directlyAssociated = await Promise.all(
            Array.from(memory.associations).map(associatedId => this.storage.retrieve(associatedId))
        );

        // Get second-degree associations
        const secondDegreePromises = directlyAssociated.flatMap(associatedMemory => {
            if (!associatedMemory || !associatedMemory.associations) return [];
            return Array.from(associatedMemory.associations)
                .filter(secondId => secondId !== id && !memory.associations!.has(secondId))
                .map(secondId => this.storage.retrieve(secondId));
        });

        const secondDegree = await Promise.all(secondDegreePromises);

        // Combine, filter out nulls, and limit results
        return [...directlyAssociated, ...secondDegree]
            .filter((m): m is IMemoryUnit => m !== null)
            .slice(0, maxResults);
    }
}
