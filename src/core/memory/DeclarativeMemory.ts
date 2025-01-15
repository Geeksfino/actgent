import { LongTermMemory } from './LongTermMemory';
import { IMemoryUnit, MemoryType } from './base';
import { IMemoryStorage, IMemoryIndex } from './storage';

/**
 * Base class for declarative (explicit) memory types.
 * Includes both semantic (facts, concepts) and episodic (events, experiences) memories.
 */
export abstract class DeclarativeMemory extends LongTermMemory<IMemoryUnit> {

    constructor(storage: IMemoryStorage, index: IMemoryIndex, memoryType: MemoryType) {
        super(storage, index, memoryType);
    }
}
