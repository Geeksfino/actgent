import { IMemoryUnit, MemoryType } from '../../types';

export interface EphemeralMemoryItem extends IMemoryUnit {
    source: string;
    type: string;
    memoryType: MemoryType;
}
