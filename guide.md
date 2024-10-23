# Actgent: An Actor-based Agent Development Framework

## Table of Contents
1. [Overview](#overview)
2. [Key Features](#key-features)
3. [Core Concepts](#core-concepts)
4. [Getting Started](#getting-started)
5. [Architecture](#architecture)
6. [Development Guide](#development-guide)
7. [Advanced Topics](#advanced-topics)
8. [Installation](#installation)

## Overview
Actgent is a message-driven framework for developing AI agents, built on Actor model principles. Each agent processes incoming messages through an Actor-like mailbox, enabling structured communication and decision-making capabilities.

## Key Features
- Message-driven architecture with priority inbox
- Structured input/output processing via schema definitions
- Flexible agent configuration and customization
- Built-in LLM integration with prompt management
- Session-based conversation handling
- Extensible classification system
- Memory management for persistent agent state

## Core Concepts
### Message Processing Flow
1. **Message Reception** → **Classification** → **Processing** → **Response**
   - Messages enter through PriorityInbox
   - LLM classifies message type
   - Agent processes according to type
   - Structured response returned

### Key Components
- **Message**: Basic communication unit containing payload, context, and metadata
- **PriorityInbox**: Actor-model mailbox managing message queue
- **Session**: Conversation context container
- **Classifier**: LLM-based message categorizer
- **PromptManager**: Template and prompt orchestrator
- **Memory**: Cross-session state manager
- **AgentCore**: Central processing unit

## Getting Started

### Quick Start
```typescript
// 1. Define agent configuration
const coreConfig = {
  name: "MyAgent",
  role: "Assistant",
  goal: "Help users with tasks",
  capabilities: ["task1", "task2"]
};

const svcConfig = {
  llmConfig: {
    apiKey: "your-api-key",
    model: "model-name",
    baseURL: "llm-provider-url",
    streamMode: true
  }
};

// 2. Create agent using AgentBuilder
const agent = new AgentBuilder(coreConfig, svcConfig)
  .build("MyCustomAgent", schemaTypes);

// 3. Start agent and create session
agent.run();
const session = await agent.createSession("owner", "initial message");
```

### Schema Definition
```typescript
const schemaTypes = [
  {
    name: "QUERY",
    prompt: "Direct question handling",
    schema: {
      answer: "<ANSWER>"
    }
  }
  // Add more types as needed
];
```

## Architecture
### Module Structure
1. **Core Module**
   - Actor Inbox
   - Decision Loop
   - Prompt Management
   - Memory
   - Tools Registry

2. **Agent Module**
   - Service Configuration
   - Network Communication
   - Agent Registry
   - Base Agent
   - Swarm Support

3. **Helpers Module**
   - Schema Builder
   - Agent Builder
   - CLI Tools

## Development Guide

### Method 1: Using AgentBuilder (Recommended)
```typescript
const agent = new AgentBuilder(coreConfig, svcConfig)
  .build("CustomAgent", schemaTypes);
```

### Method 2: Extending BaseAgent
```typescript
class CustomAgent extends BaseAgent<SchemaTypes, DefaultClassifier<SchemaTypes>, DefaultPromptTemplate<SchemaTypes>> {
  constructor(core_config: AgentCoreConfig, svc_config: AgentServiceConfig) {
    super(core_config, svc_config, schemaTypes);
  }

  protected useClassifierClass() {
    return DefaultClassifier;
  }

  protected usePromptTemplateClass() {
    return DefaultPromptTemplate;
  }
}
```

## Advanced Topics

### Custom Classification Types
Define specialized message types for your agent:
```typescript
const customTypes = [
  {
    name: "SPECIALIZED_TASK",
    prompt: "Handle specific domain task",
    schema: {
      steps: ["<STEP1>", "<STEP2>"],
      requirements: {
        inputs: ["<INPUT1>"],
        outputs: ["<OUTPUT1>"]
      }
    }
  }
] as const;
```

### Event Handling
```typescript
session.onEvent((data) => {
  console.log("Received:", data);
});
```

## Installation
```bash
# Install dependencies
bun install

# Add development dependencies
bun add bun-types --dev

# Run tests
bun run test/TestAgentService.ts
```