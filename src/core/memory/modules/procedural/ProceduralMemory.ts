import { LongTermMemory } from '../../LongTermMemory';
import { IMemoryStorage, IMemoryIndex } from '../../storage';
import { MemoryType, MemoryFilter } from '../../base';
import { IProceduralMemoryUnit, ProceduralMetadata } from './types';
import crypto from 'crypto';
import { z } from 'zod';

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
    public createMemoryUnit<C>(
        content: C | string, 
        schema?: z.ZodType<C>, 
        metadata?: Map<string, any>
    ): IProceduralMemoryUnit {
        let validatedContent: C | string;

        if (typeof content === 'string') {
            validatedContent = content;
        } else {
            if (!schema) {
                throw new Error('Schema is required for object content');
            }
            const validationResult = schema.safeParse(content);
            if (!validationResult.success) {
                throw new Error(`Invalid procedural memory content: ${validationResult.error}`);
            }
            validatedContent = validationResult.data;
        }

        const now = new Date();
        const proceduralMetadata = new Map<string, any>([
            ['type', MemoryType.PROCEDURAL],
            ['timestamp', now],
            ['proficiency', metadata?.get('proficiency') || 0],
            ['successCount', metadata?.get('successCount') || 0],
            ['failureCount', metadata?.get('failureCount') || 0],
            ['lastExecuted', metadata?.get('lastExecuted') || now]
        ]) as ProceduralMetadata;

        const procedure = typeof validatedContent === 'string' ? validatedContent : JSON.stringify(validatedContent);
        const expectedOutcomes = metadata?.get('expectedOutcomes') || [];
        const applicableContext = metadata?.get('applicableContext') || [];

        // Create memory unit with validated content
        return {
            id: crypto.randomUUID(),
            content: validatedContent,
            metadata: proceduralMetadata,
            timestamp: now,
            memoryType: MemoryType.PROCEDURAL,
            procedure,
            expectedOutcomes,
            applicableContext,
            createdAt: now  // Add required createdAt field
        };
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

    isMemoryUnitOfType(unit: any): unit is IProceduralMemoryUnit {
        return unit && 
               typeof unit === 'object' && 
               unit.memoryType === MemoryType.PROCEDURAL &&
               typeof unit.procedure === 'string' &&
               Array.isArray(unit.expectedOutcomes) &&
               Array.isArray(unit.applicableContext);
    }
}
