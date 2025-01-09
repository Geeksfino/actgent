import { IMemoryUnit, MemoryType } from '../../../src/core/memory/types';

export function createTestMemory(options?: Partial<IMemoryUnit>): IMemoryUnit {
    return {
        id: options?.id || Math.random().toString(36).substring(7),
        content: options?.content || { text: 'test memory' },
        metadata: options?.metadata || new Map(),
        timestamp: options?.timestamp || new Date('2025-01-08T13:24:12+08:00'),
        priority: options?.priority,
        accessCount: options?.accessCount,
        lastAccessed: options?.lastAccessed,
        associations: options?.associations
    };
}

export function createWorkingMemory(content: any, expiresAt: number): IMemoryUnit {
    const metadata = new Map<string, any>();
    metadata.set('type', MemoryType.WORKING);
    metadata.set('expiresAt', expiresAt);
    metadata.set('timestamp', Date.now());

    return {
        id: crypto.randomUUID(),
        content,
        metadata,
        timestamp: new Date()
    };
}

export function createContextualMemory(content: any, context: string): IMemoryUnit {
    return {
        id: crypto.randomUUID(),
        content,
        metadata: new Map<string, any>([
            ['type', MemoryType.CONTEXTUAL],
            ['context', context],
            ['timestamp', Date.now()]
        ]),
        timestamp: new Date()
    };
}

export function createEpisodicMemory(content: any, context: string): IMemoryUnit {
    return {
        id: crypto.randomUUID(),
        content,
        metadata: new Map<string, any>([
            ['type', MemoryType.EPISODIC],
            ['context', context],
            ['timestamp', Date.now()]
        ]),
        timestamp: new Date()
    };
}
