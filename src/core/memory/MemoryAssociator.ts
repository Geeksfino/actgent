import { IMemoryUnit, IMemoryStorage, IMemoryIndex } from './types';

export class MemoryAssociator {
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

        // Initialize associations arrays if they don't exist
        if (!sourceMemory.associations) sourceMemory.associations = [];
        if (!targetMemory.associations) targetMemory.associations = [];

        // Add bidirectional associations if they don't already exist
        if (!sourceMemory.associations.includes(targetId)) {
            sourceMemory.associations.push(targetId);
        }
        if (!targetMemory.associations.includes(sourceId)) {
            targetMemory.associations.push(sourceId);
        }

        // Update both memories
        await Promise.all([
            this.storage.update(sourceMemory),
            this.storage.update(targetMemory),
            this.index.index(sourceMemory),
            this.index.index(targetMemory)
        ]);
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
            sourceMemory.associations = sourceMemory.associations.filter((id: string) => id !== targetId);
        }
        if (targetMemory.associations) {
            targetMemory.associations = targetMemory.associations.filter((id: string) => id !== sourceId);
        }

        // Update both memories
        await Promise.all([
            this.storage.update(sourceMemory),
            this.storage.update(targetMemory),
            this.index.index(sourceMemory),
            this.index.index(targetMemory)
        ]);
    }

    async findRelatedMemories(id: string): Promise<IMemoryUnit[]> {
        const memory = await this.storage.retrieve(id);
        if (!memory) {
            throw new Error('Memory not found');
        }

        if (!memory.associations || memory.associations.length === 0) {
            return [];
        }

        // Get all directly associated memories
        const directlyAssociated = await Promise.all(
            memory.associations.map(associatedId => this.storage.retrieve(associatedId))
        );

        // Get second-degree associations
        const secondDegreePromises = directlyAssociated.flatMap(associatedMemory => {
            if (!associatedMemory || !associatedMemory.associations) return [];
            return associatedMemory.associations
                .filter(secondId => secondId !== id && !memory.associations!.includes(secondId))
                .map(secondId => this.storage.retrieve(secondId));
        });

        const secondDegree = await Promise.all(secondDegreePromises);

        // Combine and filter out nulls
        return [...directlyAssociated, ...secondDegree].filter((m): m is IMemoryUnit => m !== null);
    }
}
