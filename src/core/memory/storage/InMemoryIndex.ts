import { IMemoryIndex, IMemoryUnit } from '../types';

/**
 * In-memory implementation of IMemoryIndex
 */
export class InMemoryIndex implements IMemoryIndex {
    private indexMap: Map<string, Set<string>> = new Map<string, Set<string>>();
    private memories: Map<string, IMemoryUnit> = new Map();

    async index(memory: IMemoryUnit): Promise<void> {
        // Store the memory
        this.memories.set(memory.id, this.deepCloneWithMaps(memory));

        // Index the content
        const terms = this.extractSearchTerms(memory);
        for (const term of terms) {
            let ids = this.indexMap.get(term);
            if (!ids) {
                ids = new Set<string>();
                this.indexMap.set(term, ids);
            }
            ids.add(memory.id);
        }
    }

    async add(memory: IMemoryUnit): Promise<void> {
        await this.index(memory);
    }

    async search(query: string): Promise<string[]> {
        const terms = this.extractSearchTerms({ content: { text: query } } as IMemoryUnit);
        if (terms.length === 0) return [];

        // Get all memory IDs that match any search term
        const matchingSets = terms
            .map(term => this.indexMap.get(term))
            .filter((set): set is Set<string> => set !== undefined);

        if (matchingSets.length === 0) return [];

        // Find intersection of all sets
        const intersection = new Set(matchingSets[0]);
        for (let i = 1; i < matchingSets.length; i++) {
            for (const id of intersection) {
                if (!matchingSets[i].has(id)) {
                    intersection.delete(id);
                }
            }
        }

        return Array.from(intersection);
    }

    async update(memory: IMemoryUnit): Promise<void> {
        // Remove old indices
        await this.delete(memory.id);
        // Add new indices
        await this.index(memory);
    }

    async delete(id: string): Promise<void> {
        // Remove from memories
        this.memories.delete(id);

        // Remove from indices
        for (const ids of this.indexMap.values()) {
            ids.delete(id);
        }

        // Clean up empty sets
        this.indexMap.forEach((ids, term) => {
            if (ids.size === 0) {
                this.indexMap.delete(term);
            }
        });
    }

    async batchIndex(memories: IMemoryUnit[]): Promise<void> {
        for (const memory of memories) {
            await this.index(memory);
        }
    }

    async getMemory(id: string): Promise<IMemoryUnit | null> {
        const memory = this.memories.get(id);
        return memory ? this.deepCloneWithMaps(memory) : null;
    }

    private extractSearchTerms(memory: IMemoryUnit): string[] {
        const text = typeof memory.content === 'string' 
            ? memory.content 
            : memory.content.text || '';

        return text
            .toLowerCase()
            .split(/\W+/)
            .filter((term: string) => term.length > 2);
    }

    private deepCloneWithMaps(obj: any): any {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }

        if (obj instanceof Map) {
            return new Map(
                Array.from(obj.entries()).map(([key, value]) => [
                    key,
                    this.deepCloneWithMaps(value)
                ])
            );
        }

        if (Array.isArray(obj)) {
            return obj.map(item => this.deepCloneWithMaps(item));
        }

        const cloned: any = {};
        for (const [key, value] of Object.entries(obj)) {
            cloned[key] = this.deepCloneWithMaps(value);
        }
        return cloned;
    }
}
