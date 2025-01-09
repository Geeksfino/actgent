# Memory System Documentation

## Overview
The Actgent memory system is designed to mimic human memory processes, providing a sophisticated mechanism for storing, retrieving, and managing information. It includes working memory, long-term memory, context management, memory consolidation, and memory association capabilities.

## Architecture

### Class Diagram
```mermaid
classDiagram
    %% Interfaces
    class IMemoryUnit {
        <<interface>>
        +id: string
        +timestamp: Date
        +content: any
        +metadata: Map<string, any>
    }

    class IEpisodicMemoryUnit {
        <<interface>>
        +timeSequence: number
        +location: string
        +actors: string[]
        +actions: string[]
        +emotions: Map<string, number>
    }

    class ISemanticMemoryUnit {
        <<interface>>
        +concept: string
        +relations: Map<string, string[]>
        +confidence: number
        +source: string
    }

    class IMemoryRetrieval {
        <<interface>>
        +query(filter: MemoryFilter): Promise<IMemoryUnit[]>
        +exists(id: string): Promise<boolean>
    }

    class IMemoryStorage {
        <<interface>>
        +store(memory: IMemoryUnit): Promise<void>
        +retrieve(id: string): Promise<IMemoryUnit>
        +update(memory: IMemoryUnit): Promise<void>
        +delete(id: string): Promise<void>
        +batchStore(memories: IMemoryUnit[]): Promise<void>
        +batchRetrieve(ids: string[]): Promise<IMemoryUnit[]>
    }

    class IMemoryIndex {
        <<interface>>
        +index(memory: IMemoryUnit): Promise<void>
        +search(query: string): Promise<string[]>
        +batchIndex(memories: IMemoryUnit[]): Promise<void>
        +remove(id: string): Promise<void>
    }

    %% Abstract Classes
    class BaseMemorySystem {
        <<abstract>>
        #storage: IMemoryStorage
        #index: IMemoryIndex
        #cache: MemoryCache
        #cacheSize: number
        #cacheExpiryMs: number
        +store(content: any, metadata?: Map): Promise<void>
        +retrieve(filter: MemoryFilter): Promise<IMemoryUnit[]>
        +delete(id: string): Promise<void>
        #cleanupCache(): void
    }

    class DeclarativeMemoryFactory {
        <<abstract>>
        +createMemoryUnit(content, metadata): IMemoryUnit
    }

    %% Concrete Classes
    class LongTermMemory {
        -declarativeMemory: DeclarativeMemory
        -proceduralMemory: ProceduralMemory
        +store(content, metadata?): Promise<void>
        +retrieve(filter): Promise<IMemoryUnit[]>
        +search(query: string): Promise<IMemoryUnit[]>
    }

    class DeclarativeMemory {
        -episodicMemory: EpisodicMemory
        -semanticMemory: SemanticMemory
        +store(content, metadata?): Promise<void>
        +retrieve(filter): Promise<IMemoryUnit[]>
        -classifyMemoryType(content, metadata?): MemoryType
    }

    class EpisodicMemory {
        -factory: EpisodicMemoryFactory
        +store(content, metadata?): Promise<void>
        +retrieve(filter): Promise<IMemoryUnit[]>
        +findSimilarExperiences(experience): Promise<IEpisodicMemoryUnit[]>
        -buildEpisodicQuery(filter): string
    }

    class SemanticMemory {
        -factory: SemanticMemoryFactory
        -conceptGraph: Map<string, Set<string>>
        +store(content, metadata?): Promise<void>
        +retrieve(filter): Promise<IMemoryUnit[]>
        +findRelatedConcepts(concept): Promise<string[]>
        -updateConceptGraph(memory): void
        -buildSemanticQuery(filter): string
    }

    class EpisodicMemoryFactory {
        +createMemoryUnit(content, metadata): IEpisodicMemoryUnit
    }

    class SemanticMemoryFactory {
        +createMemoryUnit(content, metadata): ISemanticMemoryUnit
    }

    class ProceduralMemory {
        +store(content, metadata?): Promise<void>
        +retrieve(filter): Promise<IMemoryUnit[]>
        -buildQuery(filter): string
    }

    class WorkingMemory {
        -timeToLive: number
        -cleanupInterval: number
        -cleanupTimer: Timer
        -ephemeralTimeToLive: number
        +store(content, metadata?): Promise<void>
        +storeEphemeral(content, metadata?): Promise<void>
        +retrieve(filter): Promise<IMemoryUnit[]>
        +update(memory: IMemoryUnit): Promise<void>
        -cleanup(): Promise<void>
        -isExpired(memory): boolean
    }

    class MemoryCache {
        -cache: Map<string, IMemoryUnit>
        -maxSize: number
        +set(id, memory): void
        +get(id): IMemoryUnit
        +clear(): void
    }

    class ContextManager {
        -currentContext: Map<string, any>
        -workingMemory: WorkingMemory
        -episodicMemory: EpisodicMemory
        +setContext(key, value): void
        +getContext(key): any
        +clearContext(): void
        +loadContext(): Promise<void>
        +getAllContext(): Map<string, any>
        +persistContext(): Promise<void>
        +storeContextAsEpisodicMemory(metadata?: Map): Promise<void>
        +cleanup(): void
    }

    class AgentMemorySystem {
        -longTermMemory: LongTermMemory
        -workingMemory: WorkingMemory
        -contextManager: ContextManager
        -consolidator: MemoryConsolidator
        -associator: MemoryAssociator
        -consolidationTimer: Timer
        -consolidationInterval: number
        +storeLongTerm(content, metadata?): Promise<void>
        +storeWorkingMemory(content, metadata?): Promise<void>
        +retrieveMemories(filter): Promise<IMemoryUnit[]>
        +setContext(key, value): void
        +getContext(key): any
        +cleanup(): void
    }

    class MemoryFilter {
        +type: MemoryType[]
        +metadataFilters: Map<string, any>[]
        +contentFilters: Map<string, any>[]
        +dateRange: {start: Date, end: Date}
        +ids: string[]
    }

    enum MemoryType {
        EPISODIC
        SEMANTIC
        PROCEDURAL
        PERCEPTUAL
        SOCIAL
        CONTEXTUAL
        WORKING
    }

    %% Relationships
    IEpisodicMemoryUnit --|> IMemoryUnit
    ISemanticMemoryUnit --|> IMemoryUnit

    BaseMemorySystem ..> IMemoryUnit
    BaseMemorySystem ..> IMemoryStorage
    BaseMemorySystem ..> IMemoryIndex
    BaseMemorySystem *-- MemoryCache

    LongTermMemory --|> BaseMemorySystem
    LongTermMemory *-- DeclarativeMemory
    LongTermMemory *-- ProceduralMemory

    DeclarativeMemory --|> BaseMemorySystem
    DeclarativeMemory *-- EpisodicMemory
    DeclarativeMemory *-- SemanticMemory

    EpisodicMemory --|> BaseMemorySystem
    EpisodicMemory *-- EpisodicMemoryFactory
    EpisodicMemory ..> IEpisodicMemoryUnit

    SemanticMemory --|> BaseMemorySystem
    SemanticMemory *-- SemanticMemoryFactory
    SemanticMemory ..> ISemanticMemoryUnit

    EpisodicMemoryFactory --|> DeclarativeMemoryFactory
    SemanticMemoryFactory --|> DeclarativeMemoryFactory

    ProceduralMemory --|> BaseMemorySystem
    WorkingMemory --|> BaseMemorySystem

    AgentMemorySystem *-- LongTermMemory
    AgentMemorySystem *-- WorkingMemory
    AgentMemorySystem *-- ContextManager
    AgentMemorySystem *-- MemoryConsolidator
    AgentMemorySystem *-- MemoryAssociator

    ContextManager *-- WorkingMemory
    ContextManager *-- EpisodicMemory
}

## Memory Transitions

The memory system implements automated transitions between different memory types through the `MemoryTransitionManager`. This component handles the movement of memories from Working Memory to Long-Term Memory based on various triggers and criteria.

### Transition Flow

The following diagram illustrates the memory transition process:

```mermaid
graph TD
    A[Working Memory] --> B[MemoryTransitionManager]
    B -->|Monitor| C[Triggers]
    C -->|1| D[Access Count]
    C -->|2| E[Time Threshold]
    C -->|3| F[Importance Score]
    C -->|4| G[Context Switches]
    C -->|5| H[Memory Capacity]
    
    D & E & F & G & H -->|Threshold Met| I[Transition Process]
    
    I -->|Analyze| J[Memory Classification]
    J -->|Choose| K[Target Memory Type]
    
    K -->|Store| L[Episodic Memory]
    K -->|Store| M[Semantic Memory]
    K -->|Store| N[Procedural Memory]
    
    L & M & N -->|Complete| O[Update Metadata]
    O -->|Cleanup| P[Remove from Working Memory]
```

The MemoryTransitionManager acts as an automated memory manager, making decisions about when and where to move memories based on their usage patterns and characteristics. This process mimics human memory transition that occurs during rest periods.

### Memory Transition Manager

The `MemoryTransitionManager` is responsible for:
- Monitoring memory usage and access patterns
- Applying transition rules and triggers
- Managing the movement of memories between different memory types
- Preserving memory metadata during transitions

```typescript
interface TransitionConfig {
    accessCountThreshold: number;      // Number of accesses before transition
    timeThresholdMs: number;          // Time in working memory before transition
    capacityThreshold: number;        // Working memory capacity threshold (0-1)
    importanceThreshold: number;      // Importance score threshold (0-1)
    contextSwitchThreshold: number;   // Number of context switches before transition
}
```

### Transition Triggers

1. **Access Frequency**
   - Monitors how often a memory is accessed
   - Triggers when access count exceeds configured threshold (default: 5)
   - Useful for identifying frequently used information
   ```typescript
   if (memory.accessCount >= config.accessCountThreshold) {
       await transitionMemory(memory);
   }
   ```

2. **Time-Based**
   - Tracks how long a memory has been in working memory
   - Triggers after configured duration (default: 24 hours)
   - Ensures older memories are properly archived
   ```typescript
   if (now - memory.timestamp >= config.timeThresholdMs) {
       await transitionMemory(memory);
   }
   ```

3. **Importance/Relevance**
   - Uses importance scores assigned to memories
   - Triggers when importance exceeds threshold (default: 0.7)
   - Prioritizes retention of significant information
   ```typescript
   if (memory.importance >= config.importanceThreshold) {
       await transitionMemory(memory);
   }
   ```

4. **Context Changes**
   - Tracks number of context switches for each memory
   - Triggers after threshold switches (default: 3)
   - Helps identify persistent, cross-context information
   ```typescript
   if (memory.contextSwitches >= config.contextSwitchThreshold) {
       await transitionMemory(memory);
   }
   ```

5. **Capacity-Based**
   - Monitors working memory usage
   - Triggers when capacity exceeds threshold (default: 80%)
   - Transitions oldest memories first to free up space
   ```typescript
   if (workingMemory.capacityUsage >= config.capacityThreshold) {
       await transitionOldestMemories();
   }
   ```

### Memory Type Classification

The system uses metadata and content analysis to determine the appropriate memory type during transition:

```typescript
private determineTargetMemoryType(memory: IMemoryUnit): MemoryType {
    const metadata = memory.metadata;
    
    // Episodic Memory: Event-based with temporal/spatial context
    if (metadata.has('timeSequence') || metadata.has('location') || 
        metadata.has('contextSwitches')) {
        return MemoryType.EPISODIC;
    }
    
    // Semantic Memory: Factual knowledge and concepts
    if (metadata.has('concept') || metadata.has('relations') || 
        metadata.get('importance') >= this.config.importanceThreshold) {
        return MemoryType.SEMANTIC;
    }

    // Procedural Memory: Task-related information
    if (metadata.has('procedure') || metadata.has('steps') || 
        metadata.has('taskRelated')) {
        return MemoryType.PROCEDURAL;
    }

    return MemoryType.SEMANTIC;  // Default type
}
```

### Metadata Preservation

During transition, important metadata is preserved and enhanced:

```typescript
{
    type: MemoryType.EPISODIC,        // New memory type
    originalType: MemoryType.WORKING,  // Original type preserved
    transitionTime: timestamp,         // When transition occurred
    accessCount: number,               // Access frequency
    importance: number,                // Memory importance score
    contextSwitches: number,          // Number of context switches
    context: string                    // Current context
}
```

### Integration with AgentMemorySystem

The MemoryTransitionManager is integrated into the AgentMemorySystem and runs periodic checks:

```typescript
class AgentMemorySystem {
    private transitionManager: MemoryTransitionManager;
    
    constructor(storage: IMemoryStorage, index: IMemoryIndex) {
        this.transitionManager = new MemoryTransitionManager(
            this.workingMemory,
            this.episodicMemory,
            this.longTermMemory,
            {
                accessCountThreshold: 5,
                timeThresholdMs: 24 * 60 * 60 * 1000,
                capacityThreshold: 0.8,
                importanceThreshold: 0.7,
                contextSwitchThreshold: 3
            }
        );
        
        // Periodic transition check
        setInterval(() => {
            this.transitionManager.checkAndTransition();
        }, TRANSITION_INTERVAL);
    }
}
```

### Future Enhancements

Planned improvements to the transition system:
1. Enhanced memory type classification using LLM analysis
2. Dynamic adjustment of transition thresholds based on usage patterns
3. Memory compression for similar or related memories
4. Improved context change detection using semantic analysis
5. Memory pruning strategies for less relevant information
6. Bidirectional transitions between memory types

## Memory Types

### 1. Working Memory
- Short-term storage for active information
- Automatically cleaned up after a configurable period (default: 30 minutes)
- Limited capacity with automatic consolidation when full
- Tracks access patterns and usage statistics

### 2. Long-Term Memory
- Persistent storage for consolidated information
- Organized into different types:
  - EPISODIC: Event-based memories
  - SEMANTIC: Factual knowledge
  - PROCEDURAL: Skill-based information
  - PERCEPTUAL: Sensory information
  - SOCIAL: Relationship and interaction data
  - CONTEXTUAL: Environmental and situational data

## Memory Association

### Association Features
- Bidirectional associations between memories
- Support for first and second-degree connections
- Automatic association strength tracking
- Association cleanup during memory consolidation

### Association Process
```typescript
// Creating a bidirectional association
memory1.associations.push(memory2.id);
memory2.associations.push(memory1.id);

// Finding related memories (up to second degree)
directAssociations = memory.associations;
secondDegreeAssociations = directAssociations.flatMap(m => m.associations);
```

## Memory Transitions

The memory system implements sophisticated transition mechanisms between different memory types, particularly from Working Memory to Episodic Memory. These transitions are triggered by various conditions to ensure efficient memory management and optimal information retention.

### Working to Episodic Memory Transitions

Memories transition from Working Memory to Episodic Memory through four main triggers:

1. **Time-based Triggers**
   - **Expiration**: When a memory's Time-To-Live (TTL) is reached
   - **Periodic Consolidation**: Automatic consolidation every 5 minutes (configurable)
   - **Implementation**: Uses both immediate transition for expired items and batch processing for periodic consolidation

2. **Access-based Triggers**
   - **Frequency**: When memories are frequently accessed (high access count)
   - **Relevance**: When memories maintain high relevance scores over time
   - **Implementation**: Tracked through memory metadata and consolidated during periodic checks

3. **Capacity-based Triggers**
   - **Memory Limit**: When working memory reaches its capacity
   - **Resource Management**: When system needs to free up space
   - **Implementation**: Immediate transition of least relevant items when capacity is reached

4. **Context-based Triggers**
   - **Context Changes**: When the active context changes significantly
   - **Task Completion**: When a conversation or task concludes
   - **Implementation**: Batch transition during context switches or task boundaries

### Implementation Mechanisms

The system uses two distinct mechanisms for these transitions:

1. **Immediate Transitions** (`moveToEpisodicMemory`)
   ```typescript
   // Used for:
   - Expiration-based transitions
   - Capacity management
   - Immediate context switches
   ```

2. **Batch Transitions** (`consolidateToEpisodic`)
   ```typescript
   // Used for:
   - Periodic consolidation
   - Context-based batch transitions
   - Access pattern-based transitions
   ```

### Memory Metadata During Transitions

When a memory transitions from Working to Episodic, the following metadata changes occur:

```typescript
{
    type: MemoryType.EPISODIC,        // Changed from WORKING
    originalType: MemoryType.WORKING,  // Original type preserved
    consolidationTime: timestamp,      // When the transition occurred
    expiresAt: removed,               // Episodic memories don't expire
    // ... other metadata preserved
}

#### Memory Transition Philosophy

In human cognition, working memory (also known as short-term memory) is like your immediate consciousness - things you're actively thinking about or processing. For example, when someone tells you a phone number and you're trying to remember it long enough to write it down.

There are two different ways information typically moves from working memory to long-term (episodic) memory:

1. **Natural Consolidation**: When you deliberately process information (like studying or having meaningful experiences), it gradually transitions from working memory to long-term memory through a process called consolidation. This is like our "batch transition" where we periodically review memories and consolidate important ones.

2. **Immediate Recording**: Sometimes, particularly intense or significant experiences bypass working memory and get recorded directly into long-term memory. For example:
   - If you witness a car accident, that memory often gets stored directly as an episodic memory
   - When you experience something highly emotional (like receiving important news)
   - When you have an "aha!" moment of sudden understanding

In our implementation, expired memories are simply removed from working memory (like natural forgetting). We only transition memories to episodic memory when:
- The memory has been accessed/processed enough times (indicating importance)
- The memory is part of a meaningful context or pattern (batch consolidation)
- The memory has high relevance or emotional significance (immediate recording)

This mirrors how human memory actually works - information that isn't reinforced simply fades from working memory, while important or meaningful information gets consolidated into long-term memory through either gradual processing or immediate recording of significant experiences.

## Context Management

### Features
- Active context tracking
- Context-based memory retrieval
- Automatic context persistence
- Context-to-episodic memory conversion

### Usage
```typescript
// Setting context
contextManager.setContext('location', 'office');
contextManager.setContext('task', 'coding');

// Converting context to episodic memory
await contextManager.storeContextAsEpisodicMemory();
```

## Best Practices

1. **Memory Storage**
   - Use working memory for temporary, active information
   - Store important information directly in long-term memory
   - Include relevant metadata for better retrieval

2. **Memory Consolidation**
   - Allow automatic consolidation to manage memory lifecycle
   - Use priority field to influence consolidation timing
   - Monitor consolidation patterns for optimization

3. **Memory Association**
   - Create meaningful associations between related memories
   - Use second-degree associations for broader context
   - Clean up obsolete associations periodically

4. **Context Management**
   - Update context frequently to maintain accuracy
   - Use context for targeted memory retrieval
   - Convert important contexts to episodic memories

## Performance Considerations

1. **Working Memory**
   - Regular cleanup of expired memories
   - Automatic consolidation of frequently accessed items
   - Capacity management through triggers

2. **Long-Term Memory**
   - Efficient indexing for fast retrieval
   - Batch operations for multiple memory operations
   - Periodic optimization of storage and indices

3. **Memory Association**
   - Limited association depth (maximum 2 degrees)
   - Cleanup of orphaned associations
   - Efficient graph traversal for related memory retrieval

## Future Improvements

1. **Memory System**
   - Implementation of memory forgetting mechanisms
   - Enhanced memory relevance scoring
   - Dynamic adjustment of consolidation thresholds

2. **Association System**
   - Weighted associations based on relevance
   - Time-based association decay
   - Advanced association pattern recognition

3. **Context Management**
   - Hierarchical context structures
   - Context prediction mechanisms
   - Enhanced context-based memory retrieval
