# Actgent: An Actor-based Agent Development Framework

Actgent is a powerful and flexible message-driven framework for developing AI agents. It provides a structured approach to creating, testing, and deploying intelligent agents for various applications. Each agent employs an Actor-like mailbox to process incoming messages. 

## Architecture Overview

Actgent follows a modular architecture designed to facilitate the development of scalable and maintainable agent systems:

1. **Agent Core**: The central component that defines the agent's behavior, decision-making processes, and interaction capabilities. It assembles various components
   of priority inbox, memory and prompt manager to support an agent's core capabilities

2. **Service Layer**: Provides essential services and utilities that agents can leverage, such as communication protocols, data processing, and external integrations.

An agent can be instantiated and called in process, in a non-blocking fashion. So if you are building a desktop application or a service that aggregates a few agents, you can treat this framework as a library and make use of it, straight. Alternatively, if you want to build a networked "community" of agents, each of which running as independent service to be called upon remotely, you can enable the network mode of the agents to support various protocols.

## Key Concepts

Actgent is built around several key concepts that work together to create powerful and flexible agents:

1. **Message**: The basic unit of communication between agents and their environment. A message is a structure that contains not only content payload of text or multimedia, but also conversation session context as well as some meta data about the contents. Session and meta data info would be important for relating historical context to construct prompts. They are also important for agents' memory implementation.
2. **Mailbox/PriorityInbox**: Manages incoming messages and prioritizes them for processing.
3. **Session**: Represents an ongoing interaction or conversation. Messages with respect to the same topic between an original requester and an agent share the same session id. Sessions can be further related.
4. **SessionContext**: Holds relevant information and state for a specific session.
5. **Memory**: Allows agents to store and retrieve information across sessions.
6. **Classifier**: Categorizes incoming messages to determine appropriate responses. This is a unique and important concept in this framework. Its main purpose is to classify an incoming message for the agent. When an agent receives a message, it is first enqueued to its priority inbox (a mailbox implementation inspired by the Actor model). An event loop monitors the queue and a handler dequeues the messages to process them one by one, each one classified into different types. This classification is done by a large language model, which comprehends a message and classify them based on the agent's criteria instruction. Upon classification, the LLM returns a message type as well as a structural answer (typically a JSON object). The agent is therefore able to receive natural language input, pass it to an LLM to get back a structural output of specific type and call upon the corresponding handler for that particular type to process the structural data. This is a "strong-typing" approach to make the agent powerful
7. **PromptTemplate**: Defines the structure of prompts sent to language models.
8. **PromptManager**: Manages and organizes multiple prompt templates.
9. **AgentCore**: The central logic and decision-making component of an agent, putting all of the above together.
10. **Agent**: The high-level abstraction that combines all these components into a functional entity.

These components work together to create a flexible and powerful agent system. For example, an Agent uses its Classifier to categorize incoming Messages, then uses the appropriate PromptTemplate to generate a response, which is sent back through the Mailbox.

## Key Strength: Structured Outputs

One of the key strengths of the Actgent framework is its focus on matching prompts with schema-defined expected LLM responses. This approach essentially maps non-structural, natural language-based input to structural output like JSON.

This allows agent developers to define prompts and expect corresponding outputs in a structural way, which is mandatory for writing handlers to process responses programmatically. This approach significantly simplifies the development process and makes it easier to create robust, predictable agents.

## Getting Started: Developing Agents with Actgent

Let's walk through the process of creating a custom agent using the Actgent framework. We'll use the TestAgent as our guide and then create a new SoftwareSpecWriterAgent to illustrate the flexibility of the framework.

### Dynamically create a custom agent using AgentBuilder

AgentBuilder is a utility class that help to make custom agent creation easy. Pass to its build method a target agent's class name and type schema definition, and a subclass of BaseAgent will be dynamically created, ready to be used.

```
import { ClassificationTypeConfig } from '../../src/IClassifier';
import { InferClassificationUnion } from '../../src/TypeInference';
import { AgentServiceConfigurator } from '../../src/AgentServiceConfigurator';
import { AgentBuilder } from '../../src/AgentBuilder';

const coreConfig = {
  name: "BaseAgent",
  role: "Software Product Manager",
  goal: 'Create software specification',
  capabilities: 'assist in testing',
};

const svcConfig = AgentServiceConfigurator.getAgentConfiguration("test/test-agent");
console.log("service config: " + JSON.stringify(svcConfig));

// Define the schema types
const schemaTypes = [
  {
    name: "SIMPLE_QUERY",
    prompt: "A straightforward question that can be answered directly.",
    schema: {
      answer: "<DIRECT_ANSWER_TO_QUERY>",
    },
  },
  {
    name: "COMPLEX_TASK",
    prompt: "A task that requires multiple steps or extended processing.",
    schema: {
      actionPlan: {
        task: "<MAIN_OBJECTIVE>",
        subtasks: ["<SUBTASK_1>", "<SUBTASK_2>", "..."],
      },
    },
  },
  {
    name: "CLARIFICATION_NEEDED",
    prompt: "The message needs clarification.",
    schema: {
      questions: ["<QUESTION_1>", "<QUESTION_2>", "..."],
    },
  },
  {
    name: "COMMAND",
    prompt: "An instruction to perform a specific action.",
    schema: {
      command: {
        action: "<SPECIFIC_ACTION>",
        parameters: {
          "<PARAM_1>": "<VALUE_1>",
          "<PARAM_2>": "<VALUE_2>",
          "...": "...",
        },
        expectedOutcome: "<DESCRIPTION_OF_EXPECTED_RESULT>",
      },
    },
  },
];

// Use AgentBuilder to create the agent
const agentBuilder = new AgentBuilder(coreConfig, svcConfig);
const testAgent = agentBuilder.build("TestAgent", schemaTypes);

testAgent.registerStreamCallback((delta: string) => {
  console.log(delta);
});
testAgent.run();

const session = await testAgent.createSession("owner", 'How to create web site?');

// Handler function to print out data received
const handler = (data: InferClassificationUnion<readonly ClassificationTypeConfig[]>): void => {
  console.log("Received event from session:", data);
};

// Pass the handler to the session
session.onEvent(handler);
```

### Steps to Create a Custom Agent

Use the AgentBuilder class for easy creation of agents. But in this section we "manually" construct agents without using the AgentBuilder, just to demonstrate
the procedure of creating an agent anatomically. It is highly recommended to use the AgentBuilder instead, however.

1. **Extend the BaseAgent class**: Create a new class that extends BaseAgent, specifying the schema types, classifier, and prompt template. In your class, you can choose different Classifier and PromptTemplate implementations but generally the default implementation will suffice

2. **Define schema types**: Create an array of objects that define the different message classifications your agent will handle. Each object should include a name, prompt, and schema. Think about what your agent does, what it will ask a large language model to respond. Sort out the types of answers it expects the LLM to reply. This schema is basically the mapping of an instruction prompt and an expected response template in JSON format. The LLM will respond with data filled 

3. **Implement the constructor**: Pass the necessary configurations to the superclass constructor.

4. **Override classifier and prompt template methods**: Implement the useClassifierClass and usePromptTemplateClass methods to specify custom or default implementations.


#### Example: TestAgent

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

#### Example: SoftwareSpecWriterAgent

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

### How to use an agent 

```
const llmApiKey = process.env.LLM_API_KEY || 'sk-<some key>';
const llmProviderUrl = process.env.LLM_PROVIDER_URL || 'https://api.deepseek.com/v1';
const llmModel = process.env.LLM_MODEL || 'deepseek-chat';

console.log("llm provider url: " + llmProviderUrl);
console.log("llm model: " + llmModel);

const svcConfig = {
  llmConfig: {
    apiKey: llmApiKey,
    model: llmModel,
    baseURL: llmProviderUrl,
    streamMode: true,
  }
};

const specWriterAgent = new SpecWriterAgent(svcConfig);
specWriterAgent.registerStreamCallback((delta: string) => {
  console.log(delta);
});
specWriterAgent.run();

const session = await specWriterAgent.createSession("owner", 'Create a stock chart mini-program');

// Handler function to print out data received
const handler = (data: InferClassificationUnion<readonly ClassificationTypeConfig[]>): void => {
    console.log("Received event from session:", data);
};

// Pass the handler to the session
session.onEvent(handler);

```

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