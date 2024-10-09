# Actgent: An Agent Development Framework

Actgent is a powerful and flexible framework for developing AI agents. It provides a structured approach to creating, testing, and deploying intelligent agents for various applications.

## Architecture Overview

Actgent follows a modular architecture designed to facilitate the development of scalable and maintainable agent systems:

1. **Agent Core**: The central component that defines the agent's behavior, decision-making processes, and interaction capabilities.

2. **Service Layer**: Provides essential services and utilities that agents can leverage, such as communication protocols, data processing, and external integrations.

3. **Testing Framework**: A robust suite of tools for unit testing, integration testing, and performance evaluation of agents.

4. **Deployment Tools**: Utilities for packaging and deploying agents in various environments, including cloud platforms and edge devices.

## Key Concepts

Actgent is built around several key concepts that work together to create powerful and flexible agents:

1. **Message**: The basic unit of communication between agents and their environment.
2. **Session**: Represents an ongoing interaction or conversation.
3. **SessionContext**: Holds relevant information and state for a specific session.
4. **Memory**: Allows agents to store and retrieve information across sessions.
5. **Classifier**: Categorizes incoming messages to determine appropriate responses.
6. **PromptTemplate**: Defines the structure of prompts sent to language models.
7. **PromptManager**: Manages and organizes multiple prompt templates.
8. **AgentCore**: The central logic and decision-making component of an agent.
9. **Mailbox/PriorityInbox**: Manages incoming messages and prioritizes them for processing.
10. **Agent**: The high-level abstraction that combines all these components into a functional entity.

These components work together to create a flexible and powerful agent system. For example, an Agent uses its Classifier to categorize incoming Messages, then uses the appropriate PromptTemplate to generate a response, which is sent back through the Mailbox.

## Key Strength: Structured Outputs

One of the key strengths of the Actgent framework is its focus on matching prompts with schema-defined expected LLM responses. This approach essentially maps non-structural, natural language-based input to structural output like JSON.

This allows agent developers to define prompts and expect corresponding outputs in a structural way, which is mandatory for writing handlers to process responses programmatically. This approach significantly simplifies the development process and makes it easier to create robust, predictable agents.

## Getting Started: Developing Agents with Actgent

Let's walk through the process of creating a custom agent using the Actgent framework. We'll use the TestAgent as our guide and then create a new SoftwareSpecWriterAgent to illustrate the flexibility of the framework.

### Steps to Create a Custom Agent

1. **Extend the BaseAgent class**: Create a new class that extends BaseAgent, specifying the schema types, classifier, and prompt template.

2. **Define schema types**: Create an array of objects that define the different message classifications your agent will handle. Each object should include a name, prompt, and schema.

3. **Implement the constructor**: Pass the necessary configurations to the superclass constructor.

4. **Override classifier and prompt template methods**: Implement the useClassifierClass and usePromptTemplateClass methods to specify custom or default implementations.

### Example: TestAgent

Here's a simplified version of the TestAgent implementation:

```typescript:actgent/test/TestAgent.ts
import { BaseAgent } from '../src/BaseAgent';
import { AgentCoreConfig, AgentServiceConfig } from '../src/interfaces';
import { DefaultPromptTemplate } from '../src/DefaultPromptTemplate';
import { DefaultClassifier } from '../src/DefaultClassifier';

const defaultTypes = [
  {
    name: "SIMPLE_QUERY",
    prompt: "A straightforward question that can be answered directly.",
    schema: {
      answer: "<DIRECT_ANSWER_TO_QUERY>",
    },
  },
  // ... other type definitions ...
] as const;

export type SchemaTypes = typeof defaultTypes;

export class TestAgent extends BaseAgent<SchemaTypes, DefaultClassifier<SchemaTypes>, DefaultPromptTemplate<SchemaTypes>> {
  constructor(core_config: AgentCoreConfig, svc_config: AgentServiceConfig, schemaTypes: SchemaTypes = defaultTypes) {
    super(core_config, svc_config, schemaTypes);
  }

  protected useClassifierClass(): new () => DefaultClassifier<SchemaTypes> {
    return class extends DefaultClassifier<SchemaTypes> {
      constructor() {
        super(defaultTypes);
      }
    };
  }

  protected usePromptTemplateClass(): new (classificationTypes: SchemaTypes) => DefaultPromptTemplate<SchemaTypes> {
    return DefaultPromptTemplate;
  }
}
```

### Example: SoftwareSpecWriterAgent

To further illustrate the flexibility of the Actgent framework, let's create a SoftwareSpecWriterAgent:

```typescript:actgent/src/agents/SoftwareSpecWriterAgent.ts
import { BaseAgent } from '../BaseAgent';
import { AgentCoreConfig, AgentServiceConfig } from '../interfaces';
import { DefaultPromptTemplate } from '../DefaultPromptTemplate';
import { DefaultClassifier } from '../DefaultClassifier';

const specWriterTypes = [
  {
    name: "REQUIREMENT_GATHERING",
    prompt: "Gather software requirements from the client.",
    schema: {
      requirements: ["<REQUIREMENT_1>", "<REQUIREMENT_2>", "..."],
      clarificationQuestions: ["<QUESTION_1>", "<QUESTION_2>", "..."],
    },
  },
  // ... other type definitions ...
] as const;

export type SpecWriterSchemaTypes = typeof specWriterTypes;

export class SoftwareSpecWriterAgent extends BaseAgent<SpecWriterSchemaTypes, DefaultClassifier<SpecWriterSchemaTypes>, DefaultPromptTemplate<SpecWriterSchemaTypes>> {
  constructor(core_config: AgentCoreConfig, svc_config: AgentServiceConfig) {
    super(core_config, svc_config, specWriterTypes);
  }

  protected useClassifierClass(): new () => DefaultClassifier<SpecWriterSchemaTypes> {
    return class extends DefaultClassifier<SpecWriterSchemaTypes> {
      constructor() {
        super(specWriterTypes);
      }
    };
  }

  protected usePromptTemplateClass(): new (classificationTypes: SpecWriterSchemaTypes) => DefaultPromptTemplate<SpecWriterSchemaTypes> {
    return DefaultPromptTemplate;
  }
}
```

This SoftwareSpecWriterAgent example demonstrates how easy it is to create a specialized agent for a specific task, such as writing software specifications. By defining custom schema types and extending the BaseAgent class, you can quickly create agents tailored to your specific needs.

## Installation and Running Tests

To get started with Actgent, follow these steps:

1. Install dependencies:
   ```
   bun install
   ```

2. Install development dependencies:
   ```
   bun add bun-types --dev
   ```

3. Run tests:
   ```
   bun run test/TestAgentService.ts
   ```

These commands will set up your development environment and run the test suite to ensure everything is working correctly.

// ... existing code ...