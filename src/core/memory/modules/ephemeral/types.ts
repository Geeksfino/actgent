import { IMemoryUnit, MemoryType } from '../../base';

export interface EphemeralMemoryItem extends IMemoryUnit {
    source: string;
    type: string;
    memoryType: MemoryType;
}
