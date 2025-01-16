# Memory System Documentation

## Overview
The Actgent memory system implements a sophisticated cognitive architecture using a signal-based design. It combines multiple memory types with an event-driven transition system to create a flexible and extensible memory framework.

## Core Components

### 1. Memory Types
```typescript
enum MemoryType {
    WORKING = 'working',      // Active processing memory
    EPISODIC = 'episodic',    // Experience-based memory
    PROCEDURAL = 'procedural', // Task and skill memory
    SEMANTIC = 'semantic',     // Knowledge and facts
    EPHEMERAL = 'ephemeral'    // Very short-term memory
}
```

### 2. Signal System
The memory system uses a signal-based design where system events trigger memory operations:

```typescript
enum MonitorSignalType {
    // Time-based signals
    TIME_INTERVAL = 'time_interval',
    CRON_SCHEDULE = 'cron_schedule',
    
    // Turn-based signals
    TURN_COUNT = 'turn_count',
    USER_TURN_END = 'user_turn_end',
    ASSISTANT_TURN_END = 'assistant_turn_end',
    
    // State-based signals
    CAPACITY_THRESHOLD = 'capacity_threshold',
    CONTEXT_CHANGE = 'context_change',
    EMOTION_PEAK = 'emotion_peak',
    GOAL_COMPLETION = 'goal_completion'
}
```

### 3. Monitor System
Monitors observe memory state and react to signals:

```typescript
interface IMemoryMonitor {
    readonly id: string;
    readonly config: MonitorConfig;
    readonly metrics: MonitorMetrics;
    
    monitor(): Observable<MemoryEvent>;
    start(): void;
    stop(): void;
    reset(): void;
}
```

### 4. Event System
Events represent memory state changes and operations:

```typescript
interface MemoryEvent {
    type: MemoryEventType;
    memory: IMemoryUnit | null;
    context?: WorkingMemoryContext;
    emotion?: EmotionalState;
    timestamp: Date;
    metadata?: Map<string, any>;
}
```

## Memory Architecture

### 1. Working Memory
- Handles active processing
- Limited capacity
- Monitored for capacity and context changes
- Direct integration with conversation flow

### 2. Episodic Memory
- Stores experiences and conversations
- Consolidation triggered by signals
- Context-aware retrieval
- Emotional state tracking

### 3. Semantic Memory
- Knowledge representation
- Entity and relation extraction
- Concept graph maintenance
- Knowledge consolidation

### 4. Procedural Memory
- Task and skill storage
- Pattern recognition
- Learning from repetition
- Skill refinement

### 5. Ephemeral Memory
- Very short-term storage
- Automatic cleanup
- Capacity monitoring
- Quick access cache

## Memory Operations

### 1. Memory Transitions
Memory transitions are now signal-driven:
1. System signals trigger monitors
2. Monitors observe memory state
3. Monitors emit events
4. Events trigger transitions
5. Transitions update memory state

### 2. Memory Consolidation
Consolidation happens through:
1. Turn-based signals (conversation patterns)
2. Time-based signals (periodic review)
3. State-based signals (capacity, context)
4. Emotional signals (significant experiences)

### 3. Context Management
Context is managed through:
1. Working context monitoring
2. Emotional state tracking
3. Goal tracking
4. Turn counting

## Implementation

### 1. Working Memory
```typescript
// Working memory implementation
class WorkingMemory extends AbstractMemory {
    constructor() {
        super(MemoryType.WORKING);
    }

    async store(content: any): Promise<void> {
        await this.validateCapacity();
        const memory = new MemoryUnit({
            content,
            type: MemoryType.WORKING,
            metadata: new Map([
                ['timestamp', new Date()],
                ['ttl', this.config.ttl]
            ])
        });
        await this.storage.store(memory);
    }
}
```

### 2. Episodic Memory
```typescript
// Episodic memory implementation
class EpisodicMemory extends AbstractMemory {
    constructor() {
        super(MemoryType.EPISODIC);
    }

    async store(experience: any): Promise<void> {
        const memory = new MemoryUnit({
            content: experience,
            type: MemoryType.EPISODIC,
            metadata: new Map([
                ['timestamp', new Date()],
                ['context', this.contextManager.getCurrentContext()]
            ])
        });
        await this.storage.store(memory);
    }
}
```

### 3. Semantic Memory
```typescript
// Semantic memory implementation
class SemanticMemory extends AbstractMemory {
    constructor() {
        super(MemoryType.SEMANTIC);
    }

    async store(knowledge: any): Promise<void> {
        const memory = new MemoryUnit({
            content: knowledge,
            type: MemoryType.SEMANTIC,
            metadata: new Map([
                ['domain', knowledge.domain],
                ['concepts', knowledge.concepts]
            ])
        });
        await this.storage.store(memory);
    }
}
```

### 4. Procedural Memory
```typescript
// Procedural memory implementation
class ProceduralMemory extends AbstractMemory {
    constructor() {
        super(MemoryType.PROCEDURAL);
    }

    async store(procedure: any): Promise<void> {
        const memory = new MemoryUnit({
            content: procedure,
            type: MemoryType.PROCEDURAL,
            metadata: new Map([
                ['steps', procedure.steps],
                ['domain', procedure.domain]
            ])
        });
        await this.storage.store(memory);
    }
}
```

### 5. Ephemeral Memory
```typescript
// Ephemeral memory implementation
class EphemeralMemory extends AbstractMemory {
    constructor() {
        super(MemoryType.EPHEMERAL);
    }

    async store(data: any): Promise<void> {
        const memory = new MemoryUnit({
            content: data,
            type: MemoryType.EPHEMERAL,
            metadata: new Map([
                ['timestamp', new Date()],
                ['ttl', this.config.ttl || 300000] // 5 minutes default
            ])
        });
        await this.storage.store(memory);
    }
}
```

## Monitor System Implementation

### 1. Memory Capacity Monitor
```typescript
class MemoryCapacityMonitor extends AbstractMemoryMonitor {
    constructor() {
        super('capacity', {
            trigger: MonitorSignalType.CAPACITY_THRESHOLD,
            signalConfig: {
                capacityThreshold: {
                    max: 1000,
                    threshold: 0.8
                }
            },
            priority: 1,
            enabled: true
        });
    }

    monitor(): Observable<MemoryEvent> {
        return new Observable(subscriber => {
            const currentSize = this.memory.size;
            const threshold = this.config.signalConfig.capacityThreshold;
            
            if (currentSize >= threshold.max * threshold.threshold) {
                subscriber.next({
                    type: 'system:warn:capacity',
                    memory: null,
                    timestamp: new Date()
                });
            }
            subscriber.complete();
        });
    }
}
```

### 2. Context Change Monitor
```typescript
class ContextChangeMonitor extends AbstractMemoryMonitor {
    constructor() {
        super('context', {
            trigger: MonitorSignalType.CONTEXT_CHANGE,
            signalConfig: {
                contextChange: {
                    properties: ['emotional', 'goals']
                }
            },
            priority: 2,
            enabled: true
        });
    }

    monitor(): Observable<MemoryEvent> {
        return new Observable(subscriber => {
            const context = this.contextManager.getCurrentContext();
            if (this.hasSignificantChange(context)) {
                subscriber.next({
                    type: 'system:change:context',
                    context,
                    timestamp: new Date()
                });
            }
            subscriber.complete();
        });
    }
}
```

### 3. Turn Monitor
```typescript
class TurnMonitor extends AbstractMemoryMonitor {
    constructor() {
        super('turns', {
            trigger: MonitorSignalType.TURN_COUNT,
            signalConfig: {
                turnCount: {
                    count: 3,
                    roles: ['user']
                }
            },
            priority: 3,
            enabled: true
        });
    }

    monitor(): Observable<MemoryEvent> {
        return new Observable(subscriber => {
            const turns = this.contextManager.getTurnCount();
            if (turns % this.config.signalConfig.turnCount.count === 0) {
                subscriber.next({
                    type: 'system:complete:turn',
                    timestamp: new Date()
                });
            }
            subscriber.complete();
        });
    }
}
```

## Event Handler Implementation

### 1. Capacity Warning Handler
```typescript
class CapacityWarningHandler implements IMemoryEventHandler {
    async onEvent(event: MemoryEvent): Promise<void> {
        if (event.type === 'system:warn:capacity') {
            await this.consolidateMemories();
        }
    }

    canHandleEventTypes(): MemoryEventType[] {
        return ['system:warn:capacity'];
    }

    private async consolidateMemories(): Promise<void> {
        // Consolidation logic
        const oldMemories = await this.memory.retrieveOldest();
        await this.consolidator.consolidate(oldMemories);
    }
}
```

### 2. Context Change Handler
```typescript
class ContextChangeHandler implements IMemoryEventHandler {
    async onEvent(event: MemoryEvent): Promise<void> {
        if (event.type === 'system:change:context') {
            await this.handleContextChange(event.context);
        }
    }

    canHandleEventTypes(): MemoryEventType[] {
        return ['system:change:context'];
    }

    private async handleContextChange(context: WorkingMemoryContext): Promise<void> {
        // Context change logic
        await this.memory.updateContext(context);
    }
}
```

## Integration

### 1. Basic Usage
```typescript
const memorySystem = new AgentMemorySystem();

// Start the memory system
memorySystem.start();

// Process messages
await memorySystem.processUserTurn(userMessage);
await memorySystem.processAssistantTurn(response);

// Stop when done
memorySystem.stop();
```

### 2. Custom Monitors
```typescript
class CustomMonitor extends AbstractMemoryMonitor {
    constructor(id: string) {
        super(id, {
            trigger: MonitorSignalType.TIME_INTERVAL,
            signalConfig: { timeInterval: { intervalMs: 5000 } },
            priority: 1,
            enabled: true
        });
    }

    monitor(): Observable<MemoryEvent> {
        return new Observable(subscriber => {
            // Monitor logic
        });
    }
}
```

### 3. Custom Event Handlers
```typescript
class CustomHandler implements IMemoryEventHandler {
    async onEvent(event: MemoryEvent): Promise<void> {
        // Handle event
    }

    canHandleEventTypes(): MemoryEventType[] {
        return ['custom:event:type'];
    }
}
```

## Best Practices

### 1. Signal Design
- Use appropriate signal types
- Consider signal frequency
- Combine signals when needed
- Handle signal priorities

### 2. Monitor Design
- Single responsibility
- Efficient memory access
- Clear event production
- Proper error handling

### 3. Event Handling
- Specific event types
- Relevant metadata
- Async handling
- Error recovery

### 4. Memory Management
- Monitor capacity
- Regular consolidation
- Context awareness
- Emotional tracking

## Performance Considerations

### 1. Signal Processing
- Batch similar signals
- Use appropriate intervals
- Filter unnecessary signals
- Handle priorities

### 2. Memory Access
- Use ephemeral memory for cache
- Batch memory operations
- Efficient indexing
- Proper cleanup

### 3. Event Handling
- Async processing
- Event batching
- Error boundaries
- Resource cleanup
