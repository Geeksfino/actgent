import { LongTermMemory } from './LongTermMemory';
import { IMemoryUnit, IMemoryStorage, IMemoryIndex, MemoryFilter, MemoryType } from './types';

/**
 * Interface for procedural actions
 */
export interface ProceduralAction {
    type: string;
    params: Record<string, any>;
}

/**
 * Procedural Memory - stores skills, procedures, and action sequences
 * that can be executed without conscious recall
 */
export class ProceduralMemory extends LongTermMemory {
    constructor(storage: IMemoryStorage, index: IMemoryIndex) {
        super(storage, index);
        this.memoryType = MemoryType.PROCEDURAL;
    }

    /**
     * Store procedural memory with action sequences
     */
    public async store(content: any, metadata?: Map<string, any>): Promise<IMemoryUnit> {
        if (!this.validateActionSequence(content)) {
            throw new Error('Invalid action sequence format');
        }

        const metadataMap = metadata || new Map<string, any>();
        metadataMap.set('type', MemoryType.PROCEDURAL);
        metadataMap.set('lastExecuted', null);
        metadataMap.set('successCount', 0);
        metadataMap.set('failureCount', 0);

        return super.store(content, metadataMap);
    }

    /**
     * Execute a procedural memory's action sequence
     */
    public async execute(memoryId: string): Promise<boolean> {
        const memory = await this.retrieve({ id: memoryId });
        if (!memory || memory.length === 0) {
            throw new Error('Procedural memory not found');
        }

        const actions = memory[0].content.actions;
        try {
            for (const action of actions) {
                await this.executeAction(action);
            }

            // Update success metrics
            const metadata = memory[0].metadata;
            metadata.set('lastExecuted', new Date());
            metadata.set('successCount', (metadata.get('successCount') || 0) + 1);
            await this.storage.update(memory[0]);

            return true;
        } catch (error) {
            // Update failure metrics
            const metadata = memory[0].metadata;
            metadata.set('lastExecuted', new Date());
            metadata.set('failureCount', (metadata.get('failureCount') || 0) + 1);
            await this.storage.update(memory[0]);

            throw error;
        }
    }

    /**
     * Clean up rarely used or unsuccessful procedures
     */
    public async cleanup(): Promise<void> {
        const memories = await this.retrieve({
            type: MemoryType.PROCEDURAL,
            metadata: new Map([
                ['failureCount', { min: 5 }]
            ])
        });

        for (const memory of memories) {
            await this.storage.delete(memory.id);
        }
    }

    /**
     * Validate the action sequence format
     */
    private validateActionSequence(content: any): boolean {
        if (!content || !Array.isArray(content.actions)) {
            return false;
        }

        return content.actions.every((action: ProceduralAction) => 
            action.type && 
            action.params && 
            typeof action.type === 'string' && 
            typeof action.params === 'object'
        );
    }

    /**
     * Execute a single action
     */
    private async executeAction(action: ProceduralAction): Promise<void> {
        switch (action.type) {
            case 'delay':
                await new Promise(resolve => setTimeout(resolve, action.params.duration));
                break;
            case 'log':
                console.log(action.params.message);
                break;
            default:
                throw new Error(`Unknown action type: ${action.type}`);
        }
    }
}
