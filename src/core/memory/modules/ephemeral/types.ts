import { IMemoryUnit, MemoryType } from '../../base';

export interface EphemeralMemoryUnit extends IMemoryUnit {
    memoryType: MemoryType.EPHEMERAL;
}
