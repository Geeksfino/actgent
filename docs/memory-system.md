# Memory System Documentation

## Overview
The ActGent memory system is designed to mimic human memory processes, providing a sophisticated mechanism for storing, retrieving, and managing information. It includes working memory, long-term memory, context management, memory consolidation, and memory association capabilities.

## Architecture

### Class Diagram
```mermaid
classDiagram
    %% Core System
    AgentMemorySystem --> WorkingMemory
    AgentMemorySystem --> LongTermMemory
    AgentMemorySystem --> ContextManager
    AgentMemorySystem --> MemoryConsolidator
    AgentMemorySystem --> MemoryAssociator
    
    %% Memory Hierarchy
    BaseMemorySystem <|-- WorkingMemory
    BaseMemorySystem <|-- LongTermMemory
    BaseMemorySystem <|-- DeclarativeMemory
    BaseMemorySystem <|-- ProceduralMemory
    DeclarativeMemory <|-- EpisodicMemory
    DeclarativeMemory <|-- SemanticMemory
    
    %% Interfaces
    BaseMemorySystem ..|> IMemorySystem
    MemoryConsolidator ..|> IMemoryConsolidation
    
    %% Dependencies
    BaseMemorySystem --> IMemoryStorage
    BaseMemorySystem --> IMemoryIndex
    ContextManager --> WorkingMemory
    ContextManager --> EpisodicMemory
    
    class AgentMemorySystem {
        -workingMemory: WorkingMemory
        -longTermMemory: LongTermMemory
        -contextManager: ContextManager
        -consolidator: MemoryConsolidator
        -associator: MemoryAssociator
        -consolidationTimer: Timer
        -consolidationInterval: number
        +storeWorkingMemory()
        +storeLongTerm()
        +retrieveMemories()
        +setContext()
        +getContext()
        +cleanup()
    }

    class BaseMemorySystem {
        #storage: IMemoryStorage
        #index: IMemoryIndex
        #cache: Map<string, IMemoryUnit>
        #cacheSize: number
        #cacheExpiryMs: number
        +store()
        +retrieve()
        +delete()
        #cleanupCache()
    }

    class WorkingMemory {
        -cleanupTimer: Timer
        -maxAge: number
        -timeToLive: number
        -ephemeralTimeToLive: number
        +store()
        +storeEphemeral()
        +update()
        +cleanup()
        -isExpired()
    }

    class LongTermMemory {
        +store()
        +retrieve()
        +search()
    }

    class DeclarativeMemory {
        -episodicMemory: EpisodicMemory
        -semanticMemory: SemanticMemory
        +store()
        +retrieve()
        -classifyMemoryType()
    }

    class EpisodicMemory {
        -factory: EpisodicMemoryFactory
        +store()
        +retrieve()
        +findSimilarExperiences()
        -buildEpisodicQuery()
    }

    class SemanticMemory {
        -factory: SemanticMemoryFactory
        -conceptGraph: Map
        +store()
        +retrieve()
        -updateConceptGraph()
        -buildSemanticQuery()
    }

    class ProceduralMemory {
        +store()
        +retrieve()
        -buildQuery()
    }

    class MemoryConsolidator {
        -triggers: Map<string, ConsolidationTrigger>
        -maxWorkingMemorySize: number
        -currentWorkingMemorySize: number
        +consolidate()
        +checkTriggers()
        +getConsolidationCandidates()
        -moveToLongTerm()
        +updateWorkingMemorySize()
    }

    class MemoryAssociator {
        +associate()
        +dissociate()
        +findRelatedMemories()
    }

    class ContextManager {
        -currentContext: Map<string, any>
        -workingMemory: WorkingMemory
        -episodicMemory: EpisodicMemory
        +setContext()
        +getContext()
        +clearContext()
        +loadContext()
        +persistContext()
        +storeContextAsEpisodicMemory()
    }

    interface IMemoryStorage {
        +store()
        +retrieve()
        +update()
        +delete()
        +batchStore()
        +batchRetrieve()
    }

    interface IMemoryIndex {
        +index()
        +search()
        +batchIndex()
        +remove()
    }

    interface IMemoryConsolidation {
        +consolidate()
        +isConsolidationNeeded()
        +getConsolidationCandidates()
    }

    interface IMemorySystem {
        +store()
        +retrieve()
        +delete()
    }
```

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

## Memory Consolidation

### Automatic Consolidation Triggers

1. **Access Count Trigger**
   - Threshold: 5 accesses
   - Consolidates frequently accessed working memories
   ```typescript
   if (memory.accessCount >= 5) {
       await consolidator.consolidate(memory);
   }
   ```

2. **Time-Based Trigger**
   - Threshold: 24 hours
   - Consolidates memories that have existed for a long period
   ```typescript
   if (now - memory.timestamp.getTime() >= 24 * 60 * 60 * 1000) {
       await consolidator.consolidate(memory);
   }
   ```

3. **Priority Change Trigger**
   - Threshold: 0.7 (on a 0-1 scale)
   - Consolidates high-priority memories
   ```typescript
   if (memory.priority >= 0.7) {
       await consolidator.consolidate(memory);
   }
   ```

4. **Context Switch Trigger**
   - Threshold: 3 context switches
   - Consolidates memories that persist across multiple contexts
   ```typescript
   if (memory.metadata.get('contextSwitches') >= 3) {
       await consolidator.consolidate(memory);
   }
   ```

5. **Memory Capacity Trigger**
   - Threshold: 80% of maximum working memory capacity
   - Triggers consolidation when working memory is nearly full
   ```typescript
   if (currentWorkingMemorySize / maxWorkingMemorySize >= 0.8) {
       await consolidator.consolidate(memory);
   }
   ```

### Consolidation Process
1. Memory is marked as IN_PROGRESS
2. Content is copied to long-term storage
3. Metadata is updated with consolidation information
4. Original working memory is updated with reference to long-term version
5. Memory is marked as CONSOLIDATED

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
