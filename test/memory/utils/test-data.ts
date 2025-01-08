import { IMemoryUnit, MemoryType } from '../../../src/core/memory/types';

export function createTestMemory(options?: Partial<IMemoryUnit>): IMemoryUnit {
    return {
        id: options?.id || Math.random().toString(36).substring(7),
        content: options?.content || { text: 'test memory' },
        metadata: options?.metadata || new Map(),
        timestamp: options?.timestamp || new Date('2025-01-07T22:13:44+08:00'),
        priority: options?.priority,
        accessCount: options?.accessCount,
        lastAccessed: options?.lastAccessed,
        associations: options?.associations
    };
}

export function createWorkingMemory(content: any, expiresAt?: number, options?: Partial<IMemoryUnit>): IMemoryUnit {
    return createTestMemory({
        ...options,
        content,
        metadata: new Map<string, any>([
            ['type', MemoryType.WORKING],
            ['expiresAt', expiresAt || new Date('2025-01-07T22:13:44+08:00').getTime() + 10000],
            ...(options?.metadata ? Array.from(options.metadata.entries()) : [])
        ])
    });
}

export function createContextualMemory(content: any, contextKey: string) {
    return createTestMemory({
        content,
        metadata: new Map<string, any>([
            ['type', MemoryType.CONTEXTUAL],
            ['contextKey', contextKey]
        ])
    });
}
