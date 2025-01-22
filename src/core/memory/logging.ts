import { LoggerFactory } from '../Logger';

// Define all possible memory tags
export const Tags = {
    // Memory Types
    Ephemeral: 'ephemeral-mem',
    Working: 'working-mem',
    Episodic: 'episodic-mem',
    Semantic: 'semantic-mem',
    Procedural: 'procedural-mem',
} as const;

// Type for memory tags
export type Tag = typeof Tags[keyof typeof Tags];

// Memory module loggers by functionality
export const loggers = {
    // General memory operations
    general: LoggerFactory.getLogger({
        module: 'memory',
        component: 'system'
    }),

    // Memory monitoring and transitions
    monitor: LoggerFactory.getLogger({
        module: 'memory',
        component: 'monitor'
    }),

    eventhandler: LoggerFactory.getLogger({
        module: 'memory',
        component: 'eventhandler'
    }),

    // LLM operations
    llm: LoggerFactory.getLogger({
        module: 'memory',
        component: 'llm'
    }),

    // Storage operations
    storage: LoggerFactory.getLogger({
        module: 'memory',
        component: 'storage'
    })
};

/* Usage Examples:

1. Memory Operations:
```typescript
// In EphemeralMemory class
loggers.general.debug('Storing item', 
    withTags({ item }, [Tags.Ephemeral, Tags.Store])
);

// In SemanticMemory class
loggers.general.debug('Updating content', 
    withTags({ content }, [Tags.Semantic, Tags.Update])
);
```

2. LLM Operations:
```typescript
// LLM operation in semantic memory
loggers.llm.debug('Processing with LLM', 
    withTags({ prompt }, [Tags.Semantic, Tags.LLM])
);
```

3. Memory Monitoring:
```typescript
// Monitor transition between memories
loggers.monitor.debug('Memory transition', 
    withTags(
        { from: 'ephemeral', to: 'episodic' },
        [Tags.Ephemeral, Tags.Episodic, Tags.Monitor, Tags.Event]
    )
);
```

Filter Examples:
- All ephemeral operations: DEBUG='tag:memory:ephemeral'
- All store operations: DEBUG='tag:op:store'
- LLM operations in semantic memory: DEBUG='mod:memory/llm,tag:memory:semantic'
- Monitor specific memory type: DEBUG='mod:memory/monitor,tag:memory:episodic'
- All operations in working memory: DEBUG='tag:memory:working'
*/
