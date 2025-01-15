import { LongTermMemory } from '../../LongTermMemory';
import { IMemoryStorage, IMemoryIndex } from '../../storage';
import { MemoryType, MemoryFilter } from '../../base';
import { IProceduralMemoryUnit, ProceduralMetadata } from './types';
import crypto from 'crypto';
import { ProceduralMemoryFactory } from './ProceduralMemoryFactory';

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
export class ProceduralMemory extends LongTermMemory<IProceduralMemoryUnit> {
    constructor(storage: IMemoryStorage, index: IMemoryIndex) {
        super(storage, index, MemoryType.PROCEDURAL);
    }

    /**
     * Create a procedural memory unit
     */
    public createMemoryUnit(content: any, metadata?: Map<string, any>): IProceduralMemoryUnit {
        return ProceduralMemoryFactory.createMemoryUnit(content, metadata);
    }

    /**
     * Store a procedural memory unit
     */
    public async store(memory: IProceduralMemoryUnit): Promise<void> {
        await this.storage.store(memory);
    }

    /**
     * Execute a procedural memory's action sequence
     */
    public async execute(memoryId: string): Promise<boolean> {
        const memory = await this.retrieve(memoryId);
        if (!memory) {
            throw new Error('Procedural memory not found');
        }

        const actions = memory.content.actions;
        try {
            for (const action of actions) {
                await this.executeAction(action);
            }

            // Update success metrics
            const metadata = memory.metadata;
            metadata.set('successCount', metadata.get('successCount') + 1);
            metadata.set('lastExecuted', new Date());
            await this.storage.update(memory);

            return true;
        } catch (error) {
            // Update failure metrics
            const metadata = memory.metadata;
            metadata.set('failureCount', metadata.get('failureCount') + 1);
            metadata.set('lastExecuted', new Date());
            await this.storage.update(memory);

            throw error;
        }
    }

    /**
     * Validate the action sequence format
     */
    private validateActionSequence(content: any): boolean {
        if (!content || !Array.isArray(content.actions)) {
            return false;
        }
        return content.actions.every((action: any) => action.type && typeof action.params === 'object');
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
