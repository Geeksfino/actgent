import { 
    IMemoryUnit, 
    IMemoryConsolidation, 
    ConsolidationStatus, 
    IMemoryStorage, 
    IMemoryIndex,
    MemoryType,
    MemoryFilter
} from './types';

export interface ConsolidationTrigger {
    type: 'access_count' | 'time_based' | 'priority_change' | 'context_switch' | 'memory_capacity';
    threshold: number;
    lastCheck?: number;
}

export class MemoryConsolidator implements IMemoryConsolidation {
    private storage: IMemoryStorage;
    private index: IMemoryIndex;
    private triggers: Map<string, ConsolidationTrigger>;
    private maxWorkingMemorySize: number;
    private currentWorkingMemorySize: number = 0;
    private consolidationThreshold: number;

    constructor(
        storage: IMemoryStorage,
        index: IMemoryIndex,
        maxWorkingMemorySize: number = 1000,
        triggers?: Map<string, ConsolidationTrigger>,
        consolidationThreshold: number = 5
    ) {
        this.storage = storage;
        this.index = index;
        this.maxWorkingMemorySize = maxWorkingMemorySize;
        this.consolidationThreshold = consolidationThreshold;
        
        // Default consolidation triggers
        this.triggers = triggers || new Map([
            ['access_count', { type: 'access_count', threshold: 5 }],
            ['time_based', { type: 'time_based', threshold: 24 * 60 * 60 * 1000 }], // 24 hours
            ['priority_change', { type: 'priority_change', threshold: 0.8 }],
            ['context_switch', { type: 'context_switch', threshold: 3 }],
            ['memory_capacity', { type: 'memory_capacity', threshold: 0.8 }]
        ]);
    }

    async consolidate(memory: IMemoryUnit): Promise<void> {
        // Get memories to consolidate
        const candidates = await this.getConsolidationCandidates();
        if (candidates.length === 0) return;

        // Group similar memories
        const groups = await this.groupSimilarMemories(candidates);

        // Consolidate each group
        for (const group of groups) {
            await this.consolidateGroup(group);
        }
    }

    async getConsolidationCandidates(): Promise<IMemoryUnit[]> {
        const filter: MemoryFilter = {
            types: [MemoryType.WORKING],
            metadataFilters: []
        };

        const memories = await this.storage.retrieveByFilter(filter);
        return memories.filter(memory => {
            const accessCount = memory.accessCount || 0;
            const lastAccessed = memory.lastAccessed?.getTime() || memory.timestamp.getTime();
            const age = Date.now() - lastAccessed;

            // Optimize memories with low access counts and old age
            if (accessCount < 5 && age > 24 * 60 * 60 * 1000) {  // 24 hours
                memory.metadata.set('optimized', true);
                return true;
            }

            // Don't optimize frequently accessed memories
            if (accessCount >= 10) {
                memory.metadata.set('optimized', false);
                return false;
            }

            return false;
        });
    }

    private async groupSimilarMemories(memories: IMemoryUnit[]): Promise<IMemoryUnit[][]> {
        const groups: IMemoryUnit[][] = [];
        const processed = new Set<string>();

        for (const memory of memories) {
            if (processed.has(memory.id)) continue;

            const similar = await this.findSimilarMemories(memory);
            if (similar.length > 0) {
                groups.push([memory, ...similar]);
                processed.add(memory.id);
                similar.forEach(m => processed.add(m.id));
            }
        }

        return groups;
    }

    private async findSimilarMemories(memory: IMemoryUnit): Promise<IMemoryUnit[]> {
        // Get related memory IDs from the index
        const relatedIds = await this.index.search(JSON.stringify(memory.content));
        
        // Filter out the current memory ID
        const otherIds = relatedIds.filter(id => id !== memory.id);
        
        // Retrieve all related memories
        const memories = await this.storage.batchRetrieve(otherIds);
        
        // Filter out null values and return valid memories
        return memories.filter((m): m is IMemoryUnit => m !== null);
    }

    private async consolidateGroup(memories: IMemoryUnit[]): Promise<void> {
        if (memories.length < 2) return;

        // Get all related memories
        const allRelatedIds = new Set<string>();
        for (const memory of memories) {
            const relatedIds = await this.index.search(JSON.stringify(memory.content));
            relatedIds.forEach(id => allRelatedIds.add(id));
        }

        // Retrieve all related memories
        const relatedMemories = await this.storage.batchRetrieve(Array.from(allRelatedIds));
        const validMemories = relatedMemories.filter((m): m is IMemoryUnit => m !== null);

        // Create consolidated memory
        const consolidatedMemory = await this.createConsolidatedMemory(validMemories);

        // Store consolidated memory
        await this.storage.store(consolidatedMemory);

        // Delete original memories
        await Promise.all(validMemories.map(m => this.storage.delete(m.id)));
    }

    private async createConsolidatedMemory(memories: IMemoryUnit[]): Promise<IMemoryUnit> {
        // Combine content from all memories
        const combinedContent = memories.reduce((acc, memory) => {
            if (typeof memory.content === 'object') {
                return { ...acc, ...memory.content };
            }
            return memory.content;
        }, {});

        // Combine metadata from all memories
        const combinedMetadata = new Map<string, any>();
        memories.forEach(memory => {
            memory.metadata.forEach((value, key) => {
                if (!combinedMetadata.has(key)) {
                    combinedMetadata.set(key, value);
                }
            });
        });

        // Preserve memory type from original memory
        const originalType = memories[0].metadata.get('type');
        if (originalType) {
            combinedMetadata.set('type', originalType);
        }

        // Set optimization flags
        const isOptimized = memories.some(m => m.metadata.get('optimized'));
        if (isOptimized) {
            combinedMetadata.set('optimized', true);
        }

        // Create new consolidated memory
        return {
            id: crypto.randomUUID(),
            content: combinedContent,
            metadata: combinedMetadata,
            timestamp: new Date(),
            accessCount: 0
        };
    }

    public isConsolidationNeeded(memory: IMemoryUnit): boolean {
        return Array.from(this.triggers.values()).some(trigger => 
            this.checkTriggerCondition(memory, trigger)
        );
    }

    private checkTriggerCondition(memory: IMemoryUnit, trigger: ConsolidationTrigger): boolean {
        switch (trigger.type) {
            case 'access_count':
                return (memory.accessCount || 0) >= trigger.threshold;
            case 'time_based':
                return Date.now() - memory.timestamp.getTime() >= trigger.threshold;
            case 'priority_change':
                return (memory.priority || 0) >= trigger.threshold;
            case 'context_switch':
                return (memory.metadata.get('contextSwitches') || 0) >= trigger.threshold;
            case 'memory_capacity':
                return (this.currentWorkingMemorySize / this.maxWorkingMemorySize) >= trigger.threshold;
            default:
                return false;
        }
    }

    public async updateWorkingMemorySize(delta: number): Promise<void> {
        this.currentWorkingMemorySize += delta;
        if (this.currentWorkingMemorySize < 0) {
            this.currentWorkingMemorySize = 0;
        }
    }
}
