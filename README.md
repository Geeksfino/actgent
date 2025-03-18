# Actgent: An Actor-based Agent Development Framework

Actgent is a powerful and flexible message-driven framework for developing AI agents. It provides a structured approach to creating, testing, and deploying intelligent agents for various applications. Each agent employs an Actor-like mailbox to process incoming messages.

## Design Philosophy

The Actgent framework is built on several key principles:

1. **Modularity**: The framework is divided into Core, Agent, and Helpers modules, allowing for separation of concerns and easy extensibility.
2. **Flexibility**: Developers can work at different levels of abstraction, from high-level agent creation to low-level core functionality customization.
3. **Type Safety**: Extensive use of TypeScript ensures type safety throughout the framework.
4. **Standardization**: The framework provides standard structures for agent responses and behaviors, ensuring consistency across different agents.
5. **Ease of Use**: Helper components simplify the process of creating and configuring agents, allowing developers to focus on defining agent behavior and knowledge.


## Framework Architecture

![Actgent Framework Architecture](path/to/architecture/diagram.png)

Actgent follows a modular architecture designed to facilitate the development of scalable and maintainable agent systems. The framework is structured into three layers: Core, Agent, and Helpers. This architecture allows for a separation of concerns and provides different levels of abstraction for developers working with the framework.

### 1. Core Layer

The foundation of the framework, containing fundamental components:

- **Actor Inbox**: Manages incoming messages for agents.
- **Decision Loop**: Handles the main processing loop for agents.
- **Prompt Management**: Manages the creation and handling of prompts.
- **Memory**: Provides storage and retrieval mechanisms for agent knowledge.
- **Tools Registry**: Manages available tools for agents.
- **Workflow**: Handles the flow of tasks and processes.

### 2. Agent Layer

Builds upon the Core, providing higher-level abstractions:

- **Service Configuration**: Manages agent-specific configurations.
- **Network Communication**: Handles inter-agent communication.
- **Agent Registry**: Manages the registration and discovery of agents.
- **Base Agent**: Provides a foundation for creating specific agents.
- **Swarm**: Enables the creation of agent swarms for complex tasks.

### 3. Helpers Layer

Provides utilities to simplify agent creation and management:

- **Schema Builder**: Defines response structures and generates validation schemas.
- **Agent Builder**: Simplifies the process of creating new agents.
- **Knowledge Builder**: Facilitates loading and validating agent configurations from Markdown files.
- **CLI**: Provides command-line tools for agent management and development.

This architecture enables developers to work at different levels of abstraction:
- Using the Helpers module for rapid agent development and configuration.
- Working with the Agent layer for more customized agent behaviors.
- Directly using the Core layer for low-level control over agent functionality.

By providing these layers of abstraction, the Actgent framework allows for both quick prototyping and deep customization of agent behaviors.

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

## Execution Flow

The Actgent framework follows a structured flow from user input to agent response:

1. User Input and Session Creation:
   - User input is received through `BaseAgent.createSession` and `Session.chat`.
   - A new session is created with the initial user input.

2. Message Creation and Enqueueing:
   - `Session.chat` creates a new `Message` object.
   - The message is sent to the agent's core and enqueued in the PriorityInbox.

3. Message Processing:
   - The AgentCore's `processMessage` method dequeues and processes the message.
   - The SessionContext is updated with the new message.

4. Prompt Construction:
   The PromptManager is responsible for constructing three types of prompts:
   a. System Prompt: Defines the agent's role and capabilities.
   b. Assistant Prompt: Provides instructions for message analysis and classification.
   c. User Prompt: Contains the actual user input and context.

   Each of these prompts is dynamically constructed using various components of the Actgent framework:

   a. System Prompt:
   - Constructed using information from the agent's configuration (AgentCoreConfig).
   - Typically includes the agent's name, role, goal, capabilities, and additional instructions.
   - This information is usually loaded from Markdown files with YAML front matter using the KnowledgeBuilder.
   - The template might look like this:
     ```typescript
     getSystemPrompt(): string {
       return `
         You are designated as: {name} with the role of: {role}.
         Your goal is: {goal}. 
         Your capabilities are: {capabilities}.
         Your objective is to align every action with this overarching mission while processing specific tasks efficiently and effectively.
         Keep this goal in mind for every task you undertake. 

         Additional Important Instructions:
         {instructions}
       `;
     }
     ```

   b. Assistant Prompt:
   - Dynamically constructed based on the classification types defined for the agent.
   - Uses information from the SchemaBuilder (specifically, the DefaultSchemaBuilder).
   - Includes descriptions of each classification type and their expected JSON response formats.
   - The template might look like this:
     ```typescript
     getAssistantPrompt(): string {
       const typesDescription = this.classificationTypes
         .map((type) => `- ${type.name}: ${type.description}`)
         .join("\n");

       const jsonFormats = this.classificationTypes
         .map(
           (type) =>
             `${type.name}:\n\`\`\`json\n${JSON.stringify(type.schema, null, 2)}\n\`\`\``
         )
         .join("\n\n");

       return `
       You are an AI assistant capable of analyzing and classifying messages into the following types:

       ${typesDescription}

       Based on the message type, provide a response in one of the following JSON formats:

       ${jsonFormats}

       Ensure that your response strictly adheres to these formats based on the identified message type.
       `;
     }
     ```

   c. User Prompt:
   - Dynamically constructed based on the current message being processed and the session context.
   - Typically includes:
     - The current message content
     - Relevant context from previous messages in the session
     - Any additional context or variables passed to the prompt manager
   - The template might look like this:
     ```typescript
     getUserPrompt(sessionContext: SessionContext, message: string, variables: { [key: string]: string }): string {
       const contextMessages = sessionContext.getRelevantMessages();
       const contextString = contextMessages.map(m => `${m.role}: ${m.content}`).join("\n");

       return `
       Previous context:
       ${contextString}

       Current message:
       ${message}

       Additional variables:
       ${Object.entries(variables).map(([key, value]) => `${key}: ${value}`).join("\n")}

       Please analyze and respond to this message based on the given context and your capabilities.
       `;
     }
     ```

   These prompts are then combined in the `resolvePrompt` method of the PromptManager:

   ```typescript
   public resolvePrompt(sessionContext: SessionContext, message: string, variables: { [key: string]: string }): Object {
     return {
       "system": this.getSystemPrompt(),
       "assistant": this.getAssistantPrompt(),
       "user": this.getUserPrompt(sessionContext, message, variables)
     };
   }
   ```

   This combined prompt is what gets sent to the LLM for processing. The dynamic construction of these prompts allows for flexible and context-aware interactions with the LLM, tailored to the specific agent's configuration and the current conversation state.

5. LLM Interaction:
   - The constructed prompts are sent to the Language Model (LLM) for processing.
   - The LLM generates a response based on these prompts.

6. Response Parsing and Classification:
   - The LLM's response is parsed and classified according to the schemas defined by the SchemaBuilder.
   - The DefaultClassifier structures the output based on predefined classification types.

7. Handling Classified Response:
   - The classified response is handled by the appropriate method in the agent.
   - This typically occurs in the `handleLLMResponse` method of BaseAgent.

8. Event Triggering:
   - The structured response triggers appropriate event handlers in the Session.
   - These events can lead to further actions or responses from the agent.

This flow ensures a systematic process from user input to agent response, leveraging the various components of the Actgent framework to produce coherent and structured interactions.

## The Builders

In order to further simplify agent creation, a few Builders are provided. They use some default implementations such as the default message classifier and default prompt template, which ought to be generic enough for most cases. If customization is needed, developers can always fall back to the core and agent layers, bypassing the builders.

Another purpose for existence of the builders is to support even higher level tools, particularly UI tools such as "Agent Editor" and "Swarm Composer", where an end user just inputs some configurations and textual information from the UI frontend, which would be passed to the builder to construct the agents and relay them.

#### AgentBuilder

The AgentBuilder simplifies the process of creating new agents by abstracting away much of the complexity involved in configuring the Core and Agent components. It:

- Initializes the AgentCore with necessary configurations
- Sets up the PromptManager with appropriate templates
- Configures the Classifier based on provided classification types
- Initializes the Memory and other Core components
- Creates an instance of BaseAgent with all required dependencies

This approach allows developers to create new agents with minimal boilerplate code, focusing on defining the agent's behavior rather than its infrastructure.

### SchemaBuilder and Prompt Construction
The SchemaBuilder plays a crucial role in defining agent response structures and impacting 
prompt construction:
- It defines standard classification types with associated schemas.
- These schemas are used to generate assistant prompts in the DefaultPromptTemplate.
- The SchemaBuilder can generate Zod schemas for runtime type checking and validation.
- It allows for dynamic modification of schemas and descriptions, enabling customization for 
specific agent needs.
- By defining classification types and schemas, it shapes the possible behaviors and outputs 
of agents.

The SchemaBuilder, specifically the DefaultSchemaBuilder in this framework, plays a crucial 
role in defining the structure of agent responses and impacting prompt construction. Here's 
how it works:

1. Classification Type Definition:
The SchemaBuilder defines a set of standard classification types (e.g., 
CLARIFICATION_NEEDED, CONFIRMATION_NEEDED, TASK_COMPLETE) with associated schemas.
2. Schema Structure:
Each classification type has a schema that defines the expected structure of the response 
for that type.
3. Dynamic Schema Modification:
The builder allows for dynamic modification of schemas and descriptions, enabling 
customization for specific agent needs.
4. Zod Schema Generation:
For JSON responses, the builder can generate Zod schemas for runtime type checking and 
validation.
5. Formatted Output Setting:
It allows setting a formatted output template for completed tasks, which can be either JSON 
or non-JSON.

The SchemaBuilder impacts prompt construction and response handling in several ways:
1. Prompt Template Generation:
The classification types and schemas defined by the SchemaBuilder are used to generate the 
assistant prompt in the DefaultPromptTemplate. This prompt instructs the LLM on how to 
structure its responses.
2. Response Validation:
The generated Zod schemas are used to validate and parse the LLM's responses, ensuring they 
conform to the expected structure.
3. Agent Behavior Definition:
By defining the classification types and their schemas, the SchemaBuilder effectively shapes 
the possible behaviors and outputs of the agent.
4. Consistency Across Agents:
Using a standardized SchemaBuilder ensures consistency in response structures across 
different agents in a project.

### Agent Creation and Configuration
The AgentBuilder and KnowledgeBuilder in the Helpers module simplify agent creation:
- AgentBuilder provides a high-level interface for creating agents with specific 
configurations and classification types.
- KnowledgeBuilder allows loading agent configurations from Markdown files, including 
instructions and other metadata.

This architecture enables developers to work at different levels of abstraction:
- Using the Helpers module for rapid agent development and configuration.
- Working with the Agent module for more customized agent behaviors.
- Directly using the Core module for low-level control over agent functionality.

By providing these layers of abstraction, the Actgent framework allows for both quick 
prototyping and deep customization of agent behaviors.

## Getting Started: Developing Agents with Actgent

Let's walk through the process of creating a custom agent using the Actgent framework. We'll use the TestAgent as our guide and then create a new SoftwareSpecWriterAgent to illustrate the flexibility of the framework.

### Option 1: Dynamically create a custom agent using convenient AgentBuilder

AgentBuilder is a utility class that help to make custom agent creation easy. Pass to its build method a target agent's class name and type schema definition, and a subclass of BaseAgent will be dynamically created, ready to be used.

```
import { ClassificationTypeConfig } from '@finogeek/actgent';
import { InferClassificationUnion } from '@finogeek/actgent';
import { AgentServiceConfigurator } from '@finogeek/actgent';
import { AgentBuilder } from '@finogeek/actgent';

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

### Option 2: Create a Custom Agent by class extension

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
