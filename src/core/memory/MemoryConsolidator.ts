import { 
    IMemoryUnit, 
    IMemoryConsolidation, 
    ConsolidationStatus, 
    IMemoryStorage, 
    IMemoryIndex,
    MemoryType
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

    constructor(
        storage: IMemoryStorage,
        index: IMemoryIndex,
        maxWorkingMemorySize: number = 1000, // Maximum number of working memories
        triggers?: Map<string, ConsolidationTrigger>
    ) {
        this.storage = storage;
        this.index = index;
        this.maxWorkingMemorySize = maxWorkingMemorySize;
        
        // Default consolidation triggers
        this.triggers = triggers || new Map([
            ['access_count', { 
                type: 'access_count',
                threshold: 5 // Consolidate after 5 accesses
            }],
            ['time_based', { 
                type: 'time_based',
                threshold: 24 * 60 * 60 * 1000, // 24 hours
                lastCheck: Date.now()
            }],
            ['priority_change', { 
                type: 'priority_change',
                threshold: 0.7 // Consolidate if priority exceeds 0.7
            }],
            ['context_switch', { 
                type: 'context_switch',
                threshold: 3 // Consolidate after 3 context switches
            }],
            ['memory_capacity', { 
                type: 'memory_capacity',
                threshold: 0.8 // Consolidate when working memory is 80% full
            }]
        ]);
    }

    async checkTriggers(memory: IMemoryUnit): Promise<boolean> {
        const now = Date.now();
        let shouldConsolidate = false;

        // Check access count trigger
        const accessTrigger = this.triggers.get('access_count');
        if (accessTrigger && (memory.accessCount || 0) >= accessTrigger.threshold) {
            shouldConsolidate = true;
        }

        // Check time-based trigger
        const timeTrigger = this.triggers.get('time_based');
        if (timeTrigger && memory.timestamp) {
            const age = now - memory.timestamp.getTime();
            if (age >= timeTrigger.threshold) {
                shouldConsolidate = true;
            }
        }

        // Check priority trigger
        const priorityTrigger = this.triggers.get('priority_change');
        if (priorityTrigger && (memory.priority || 0) >= priorityTrigger.threshold) {
            shouldConsolidate = true;
        }

        // Check context switch trigger
        const contextTrigger = this.triggers.get('context_switch');
        if (contextTrigger) {
            const contextSwitches = memory.metadata.get('contextSwitches') || 0;
            if (contextSwitches >= contextTrigger.threshold) {
                shouldConsolidate = true;
            }
        }

        // Check memory capacity trigger
        const capacityTrigger = this.triggers.get('memory_capacity');
        if (capacityTrigger) {
            const capacityRatio = this.currentWorkingMemorySize / this.maxWorkingMemorySize;
            if (capacityRatio >= capacityTrigger.threshold) {
                shouldConsolidate = true;
            }
        }

        return shouldConsolidate;
    }

    async consolidate(memory: IMemoryUnit): Promise<void> {
        if (!this.isConsolidationNeeded(memory) && !(await this.checkTriggers(memory))) {
            return;
        }

        // Mark memory as being consolidated
        memory.metadata.set('consolidationStatus', ConsolidationStatus.IN_PROGRESS);
        await this.storage.update(memory);

        try {
            // If it's a working memory with triggered consolidation, move it to long-term storage
            if (memory.metadata.get('type') === MemoryType.WORKING) {
                await this.moveToLongTerm(memory);
                this.currentWorkingMemorySize--;
            }

            // Update consolidation status and metadata
            memory.metadata.set('consolidationStatus', ConsolidationStatus.CONSOLIDATED);
            memory.metadata.set('lastConsolidated', new Date().toISOString());
            memory.metadata.set('consolidationTriggers', Array.from(this.triggers.entries())
                .filter(([_, trigger]) => this.checkTriggerCondition(memory, trigger))
                .map(([type, _]) => type)
            );

            await this.storage.update(memory);
            await this.index.index(memory);
        } catch (error) {
            // If consolidation fails, mark it as unconsolidated
            memory.metadata.set('consolidationStatus', ConsolidationStatus.UNCONSOLIDATED);
            await this.storage.update(memory);
            throw error;
        }
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

    isConsolidationNeeded(memory: IMemoryUnit): boolean {
        return memory.metadata.get('consolidationStatus') !== ConsolidationStatus.CONSOLIDATED;
    }

    async getConsolidationCandidates(): Promise<IMemoryUnit[]> {
        const candidates = await this.storage.batchRetrieve(
            await this.index.search(`
                (consolidationStatus:${ConsolidationStatus.UNCONSOLIDATED} OR 
                 consolidationStatus:${ConsolidationStatus.IN_PROGRESS})
            `)
        );

        const needsConsolidation = await Promise.all(
            candidates.map(async memory => ({
                memory,
                shouldConsolidate: this.isConsolidationNeeded(memory) || await this.checkTriggers(memory)
            }))
        );

        return needsConsolidation
            .filter(({ shouldConsolidate }) => shouldConsolidate)
            .map(({ memory }) => memory);
    }

    private async moveToLongTerm(memory: IMemoryUnit): Promise<void> {
        // Create a copy of the memory for long-term storage
        const longTermMemory: IMemoryUnit = {
            ...memory,
            id: `lt_${memory.id}`, // New ID for long-term version
            metadata: new Map([
                ...Array.from(memory.metadata.entries()),
                ['type', MemoryType.EPISODIC], // Convert to episodic memory
                ['originalId', memory.id],
                ['consolidatedFrom', 'working_memory'],
                ['consolidationTimestamp', new Date().toISOString()]
            ])
        };

        // Store the long-term version
        await this.storage.store(longTermMemory);
        await this.index.index(longTermMemory);

        // Update the original memory with a reference to the long-term version
        memory.metadata.set('longTermId', longTermMemory.id);
        await this.storage.update(memory);
    }

    // Method to update working memory size
    async updateWorkingMemorySize(delta: number): Promise<void> {
        this.currentWorkingMemorySize += delta;
        if (this.currentWorkingMemorySize < 0) {
            this.currentWorkingMemorySize = 0;
        }
    }
}
