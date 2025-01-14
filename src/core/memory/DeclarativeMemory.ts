import { LongTermMemory } from './LongTermMemory';
import { IMemoryUnit, IMemoryStorage, IMemoryIndex, MemoryFilter, MemoryType } from './types';

/**
 * Base class for declarative (explicit) memory types.
 * Includes both semantic (facts, concepts) and episodic (events, experiences) memories.
 */
export abstract class DeclarativeMemory extends LongTermMemory<IMemoryUnit> {

    constructor(storage: IMemoryStorage, index: IMemoryIndex, memoryType: MemoryType) {
        super(storage, index, memoryType);
    }
}
