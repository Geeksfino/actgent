import { IMemoryUnit } from './base';
import { WorkingMemoryContext, EmotionalState } from './context';

// Memory Events
export type MemoryEventType =
    | 'ephemeral:add:item'
    | 'ephemeral:clear:all'
    | 'working:add:item'
    | 'working:update:items'
    | 'working:forget:item'
    | 'semantic:extract:entities'
    | 'semantic:update:triples'
    | 'semantic:updated:items'
    | 'episodic:create:entry'
    | 'episodic:update:items'
    | 'procedural:learn:procedure'
    | 'procedural:forget:procedure'
    | 'procedural:updated:items'
    | 'system:warn:capacity'
    | 'system:complete:task'
    | 'system:change:context';

/**
 * Memory Event
 */
export type MemoryEvent = {
    type: MemoryEventType;
    memory: IMemoryUnit | null;  // null for system events like capacity warnings
    context?: WorkingMemoryContext;
    emotion?: EmotionalState;
    timestamp: Date;
    metadata?: Map<string, any>;
}

/**
 * Memory Event Handlers
 */
export interface IMemoryEventHandler {
    onEvent(event: MemoryEvent): Promise<void>;
    canHandleEventTypes(): MemoryEventType[];
}
