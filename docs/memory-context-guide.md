# Memory and Context Framework Guide

This guide demonstrates how to use the memory and context frameworks in the Actgent project to create intelligent agents with memory capabilities.

## Table of Contents
- [Installation](#installation)
- [Architecture Overview](#architecture-overview)
- [Context and Memory Architecture](#context-and-memory-architecture)
- [Integration Examples](#integration-examples)
- [Getting Started with AgentMemorySystem](#getting-started-with-agentmemorysystem)
- [Best Practices](#best-practices)

## Installation

```bash
# Install dependencies
npm install @actgent/core
```

## Architecture Overview

The memory and context framework is built with a layered architecture:

1. **AgentMemorySystem**: The top-level system that coordinates all memory operations
2. **Memory Managers**: Handle specific aspects of memory management
3. **Individual Memory Systems**: Implement specific types of memory
4. **Storage and Indexing**: Handle persistence and retrieval

### Key Components

```typescript
import { 
    AgentMemorySystem,
    MemoryContextManager,
    MemoryTransitionManager,
    MemoryAssociator
} from '@actgent/core/memory';

// Initialize storage and index
const storage = new MemoryStorage();
const index = new MemoryIndex();

// Create the agent memory system
const agentMemory = new AgentMemorySystem(storage, index);
```

## Context and Memory Architecture

The framework provides a unified system for managing both memory and context:

### 1. Context Management

```typescript
// Get the context manager from the memory system
const contextManager = agent.memory.getContextManager();

// Managing conversation context
await contextManager.setContext('conversation', 'currentTopic', 'cooking');
await contextManager.setContext('conversation', 'userSkillLevel', 'beginner');

// Adding messages with context
await contextManager.addMessage({
    content: "How do I make pasta?",
    metadata: {
        domain: 'cooking',
        skillLevel: 'beginner'
    }
});

// Managing memory context
await contextManager.setContext('memory', 'relevanceThreshold', 0.7);
await contextManager.setContext('memory', 'retentionPeriod', '24h');
```

### 2. Memory Operations

```typescript
// Store with context
await agent.memory.store(
    "Pasta should be cooked in salted water",
    {
        type: 'conversation',
        data: new Map([
            ['domain', 'cooking'],
            ['topic', 'pasta']
        ])
    }
);

// Retrieve with context
const memories = await agent.memory.retrieve({
    contextType: 'conversation',
    domain: 'cooking',
    topic: 'pasta'
});
```

### 3. Memory Transitions

Memory transitions happen automatically based on context and relevance:

```typescript
// Configure transition behavior
await contextManager.setContext('memory', 'transitions', {
    workingToEpisodic: {
        threshold: 0.7,
        delay: '1h'
    },
    episodicToLongTerm: {
        threshold: 0.9,
        delay: '24h'
    }
});

// Store information - transitions happen automatically
await agent.memory.store(information);
```

## Integration Examples

Here's how to create a fully context-aware agent:

```typescript
import { 
    AgentMemorySystem,
    ConversationContextManager,
    MemoryContextManager,
    NLPService
} from '@actgent/core';

class IntelligentAgent {
    private memorySystem: AgentMemorySystem;
    private conversationManager: ConversationContextManager;
    private contextManager: MemoryContextManager;

    constructor(
        storage: IMemoryStorage, 
        index: IMemoryIndex,
        nlpService: NLPService
    ) {
        // Initialize memory system
        this.memorySystem = new AgentMemorySystem(storage, index);
        
        // Initialize context managers
        this.conversationManager = new ConversationContextManager(
            this.memorySystem.getWorkingMemory(),
            nlpService
        );
        this.contextManager = new MemoryContextManager(storage, index);
    }

    async processInput(input: string) {
        // Create message
        const message = {
            content: input,
            timestamp: new Date(),
            type: 'user'
        };

        // Update conversation context
        await this.conversationManager.addMessage(message);

        // Get relevant memories
        const memories = await this.memorySystem.retrieve({
            type: MemoryType.EPISODIC,
            filter: {
                content: input
            }
        });

        // Get current context
        const context = await this.contextManager.getCurrentContext();

        // Process with all available context
        return await this.generateResponse({
            message,
            memories,
            context
        });
    }
}
```

## Getting Started with AgentMemorySystem

The `AgentMemorySystem` is designed to be the complete memory implementation that can be configured based on your needs. While it includes all memory types (working, episodic, and long-term), you can start simple by just using working memory and gradually utilize more features as needed:

```typescript
import { 
    AgentMemorySystem,
    IMemoryStorage, 
    IMemoryIndex,
    IMemoryUnit,
    MemoryFilter
} from '@actgent/core/memory';

// Agent using the memory system
class Agent {
    private memory: AgentMemorySystem;

    constructor(storage: IMemoryStorage, index: IMemoryIndex) {
        // Create memory system with default configuration
        this.memory = new AgentMemorySystem(storage, index);
    }

    // Start simple - just use working memory
    async remember(information: any) {
        await this.memory.storeWorkingMemory(information);
    }

    async recall(filter: MemoryFilter) {
        return await this.memory.retrieveWorkingMemories(filter);
    }

    // Later, when ready for more advanced features:
    async storeExperience(experience: any) {
        // Let the system handle transitions automatically
        await this.memory.store(experience);
    }

    async findSimilarExperiences(filter: MemoryFilter) {
        // System will search across all appropriate memory types
        return await this.memory.retrieve(filter);
    }
}
```

## Best Practices

1. **Use the Context Manager**:
   - Always get the context manager from the memory system
   - Use appropriate context types for different scenarios
   - Let the system handle transitions automatically

2. **Context Types**:
   - 'conversation': For dialog and interaction context
   - 'memory': For memory system configuration
   - 'domain': For domain-specific knowledge and rules

3. **Memory Operations**:
   - Always provide relevant context when storing memories
   - Use specific filters when retrieving memories
   - Trust the system to handle memory transitions

4. **Event Handling**:
   - Subscribe to context changes
   - Process events asynchronously
   - Handle errors appropriately

5. **Performance**:
   - Monitor context size
   - Clean up old contexts
   - Optimize event processing

6. **Logging**:
   - Log context changes
   - Log emotional state changes
   - Log memory transitions

7. **Migration Steps**:
   - Update to new context interfaces
   - Implement RxJS event handling
   - Add proper logging
   - Review context transitions
