# How It Works: Actgent Framework

## Introduction

The Actgent framework is designed for creating sophisticated AI agents that can handle complex tasks through structured interactions with large language models. This document explains the internal workings of the framework, focusing on its architecture, message flows, and core mechanisms.

### Key Concepts

- **Agent**: An AI entity that processes messages and performs actions using LLMs
- **Instruction**: A structured directive that guides agent behavior
- **Tool**: A function that agents can use to perform specific actions
- **Classification**: The process of categorizing LLM responses for proper handling
- **Prompt Template**: A structured format for communicating with LLMs


## Message Flow Overview

The framework operates on a message-based architecture where all interactions are handled through messages. The framework distinguishes between session ownership and message senders:

### Session Ownership and Message Senders

1. **Session Owner**
   - Each session has an owner (typically a user)
   - Owner is set when creating a session via `createSession(owner, description)`
   - Represents the entity that initiated and owns the conversation
   - Used as default sender when no explicit sender is specified

2. **Message Senders**
   - Each message has a sender specified in its metadata
   - Senders can be:
     - User (typically the session owner)
     - Assistant (LLM responses)
     - Agent (tool execution results)
     - System (system messages)
   - When sending to LLM, senders are mapped to OpenAI roles:
     - "agent" and "assistant" → "assistant" role
     - "system" → "system" role
     - All others → "user" role

### Message Flows

There are two primary message flows:

1. **Inbound Messages**
   Messages coming into an agent can originate from:
   - **User/Application Input**
     - Via `session.chat()` or `createSession()`
     - Messages are wrapped in a Message object with session context
     - Enqueued into PriorityInbox for processing

   - **LLM Responses**
     - Generated after LLM processes a prompt
     - Classified and handled based on response type
     - May trigger tool executions or direct responses

2. **Outbound Messages**
   Messages going out from an agent can be directed to:
   1. **User/Application**
     - Via session conversation handlers
     - Via session event handlers
     - Contains processed results or direct responses

   2. **LLM**
     - Constructed prompts for new inference
     - Tool execution results for further processing
     - Context and history for maintaining conversation flow

## Core Architecture

### Core Components and Their Roles

#### AgentCore
Central coordinator of the agent system:
- Manages message processing through PriorityInbox
- Coordinates between components (PromptManager, Classifier, etc.)
- Handles tool registration and execution
- Maintains session contexts and memory

Key methods:
```typescript
receive(message): Enqueues messages into PriorityInbox
processMessage(message): Main message processing pipeline
promptLLM(message): Constructs and sends prompts to LLM
handleLLMResponse(response): Processes LLM responses
```

#### Session
Manages individual conversation contexts:
- Creates and tracks messages within a session
- Handles different types of responses through handlers
- Maintains conversation state and history

Key handlers:
```typescript
conversationHandlers: For direct responses to user
eventHandlers: For structured event processing
toolResultHandlers: For tool execution results
exceptionHandlers: For error conditions
```

#### PromptManager
Manages prompt construction and rendering:
- Works with PromptTemplates to generate prompts
- Maintains agent role, goal, and capabilities
- Handles prompt variable substitution

Key responsibilities:
```typescript
getSystemPrompt(): Generates system-level prompts
getAssistantPrompt(): Generates assistant-level prompts
getUserPrompt(): Formats user messages
```

#### PromptTemplate (e.g., ReActPromptTemplate)
Defines the structure and format of prompts:
- Provides templates for different message types
- Handles response formatting instructions
- Supports different interaction modes (direct/ReAct)

Key aspects:
```typescript
- System prompt template
- Assistant prompt template
- Response format specifications
- Tool invocation formats
```

#### Classifier (e.g., ReActClassifier)
Processes and categorizes LLM responses:
- Parses LLM responses into structured formats
- Determines response types (DIRECT_RESPONSE/TOOL_INVOCATION)
- Triggers appropriate handlers based on response type

Key operations:
```typescript
handleLLMResponse(): Main response processing
parseLLMResponse(): Structures raw responses
validateResponse(): Ensures response format compliance
```

## Tool Registration and Instruction Mapping

The framework provides two distinct ways for tools to be used by an agent:

### 1. Direct Tool Access
- Tools registered via `agent.registerTool()` are exposed as OpenAI functions by default
- LLM can make direct function calls to these tools
- Suitable for general-purpose tools that can be used anytime
- Example:
  ```typescript
  // Register a utility tool
  agent.registerTool(new FileSearchTool());
  ```

### 2. Instruction-Mapped Tools
- Tools can be mapped to specific instructions in agent configuration
- When mapped, the tool is removed from OpenAI function list
- Can only be triggered through the mapped instruction
- Enforces proper validation through instruction's schema template
- Example:
  ```yaml
  # In brain.md
  instructions:
      creation: "instructions/creation.md"
  
  # In creation.md
  instructionName: Creation
  schemaTemplate: "creation.json"
  tool: "AgentGenerator"  # Maps tool to instruction
  ```

### How Tool Mapping Works

1. **Tool Registration**:
   ```typescript
   // Register the AgentGenerator tool
   AgentSmith.registerTool(new AgentGenerator());
   ```

2. **Function List Filtering**:
   ```typescript
   // In AgentCore.promptLLM()
   const unmappedTools = Array.from(this.toolRegistry.values())
     .filter(
       (tool) => !Object.values(this.instructionToolMap).includes(tool.name)
     )
     .map((tool) => tool.getFunctionDescription());

   const baseConfig = {
     model: this.llmConfig?.model || "gpt-4",
     messages,
     tools: unmappedTools.length > 0 ? unmappedTools : undefined,
   };
   ```

### Design Rationale

This dual approach to tool usage serves several purposes:

1. **Control Flow**:
   - Direct tools: For simple, stateless operations
   - Mapped tools: For complex operations requiring validation

2. **Schema Validation**:
   - Instruction mapping enforces schema validation
   - Ensures complex operations follow proper protocols
   - Example: AgentGenerator must follow Creation instruction schema

3. **Architectural Benefits**:
   - Clean separation of concerns
   - Proper validation for complex operations
   - Flexibility for simple utility tools
   - Better control over LLM's tool access

For example, the AgentGenerator tool is mapped to the Creation instruction because:
1. Agent creation is a complex operation needing validation
2. The Creation instruction's schema ensures proper parameters
3. The mapping prevents direct, unvalidated agent creation
4. Results are properly handled through instruction flow

## Instructions and Classification Types

### Instructions Flow Overview

Instructions in the Actgent framework follow a specific flow from configuration to prompt templates:

1. **Initial Configuration**
   - Instructions are defined in markdown files with front matter
   - Loaded by AgentCoreConfigurator into AgentCoreConfig
   - Each instruction can have:
     - name: Identifier for the instruction
     - description: Human-readable description
     - schemaTemplate: Optional JSON schema defining response format
     - tool: Optional tool name to handle instruction output (see Tool Registration and Instruction Mapping section)

2. **AgentCore Integration**
   ```typescript
   class AgentCore {
     public instructions: Instruction[] = [];
     constructor(config: AgentCoreConfig, ...) {
       this.instructions = config.instructions || [];
       // Instructions are also mapped to tools
       if (config.instructionToolMap) {
         this.instructionToolMap = config.instructionToolMap;
       }
     }
   }
   ```

3. **Conversion to Classification Types**
   The framework provides two paths for converting instructions to classification types:

   a. **Using SchemaBuilder (Recommended)**
   ```typescript
   const schemaBuilder = new SchemaBuilder(instructions);
   const classificationTypes = schemaBuilder.build();
   ```
   SchemaBuilder maps each instruction to a ClassificationTypeConfig:
   - instruction.name → type.name
   - instruction.description → type.description
   - instruction.schemaTemplate → type.schema (parsed JSON)

   b. **Direct Classification Types**
   ```typescript
   // Example from basic-agent.ts
   const classificationTypes = [
     {
       name: "greeting",
       description: "General greetings and pleasantries",
       schema: { messageType: "greeting", content: "string" }
     },
     // ... other types
   ] as const;
   ```

4. **Usage in Prompt Templates**
   Classification types are used by prompt templates (like ReActPromptTemplate) to:
   - Define valid response formats
   - Generate schema documentation in prompts
   - Validate LLM responses

   ```typescript
   class ReActPromptTemplate {
     private getFormattedSchemas(): SchemaFormatting {
       // Convert classification types to prompt format
       const types = this.classificationTypes
         .map((type) => `- ${type.name}: ${type.description}`)
         .join("\n");

       const schemas = this.classificationTypes
         .map((type) => 
           `${type.name}:\n\`\`\`json\n${JSON.stringify(type.schema)}\n\`\`\``)
         .join("\n\n");

       return { types, schemas };
     }
   }
   ```

### Helper Classes (Optional)

While the framework provides helper classes like SchemaBuilder and AgentBuilder to streamline the process of converting instructions to classification types, they are not mandatory:

1. **SchemaBuilder**
   - Convenient utility for mapping instructions to classification types
   - Handles JSON schema parsing and validation
   - Provides methods for dynamic instruction management

2. **AgentBuilder**
   - Uses SchemaBuilder internally
   - Provides a fluent API for agent construction
   - Handles configuration loading and component wiring

3. **Direct Implementation**
   As shown in basic-agent.ts, you can directly:
   - Define classification types without SchemaBuilder
   - Create prompt templates with those types
   - Initialize AgentCore with manual configuration

The choice between using helper classes or direct implementation depends on your needs:
- Use helpers for complex agents with many instructions
- Use direct implementation for simple agents or custom logic
- Mix approaches as needed - the framework is flexible

## Implementation Details

### Message Handling

1. **Message Creation**
   ```typescript
   // Create message with default sender (session owner)
   session.createMessage("Hello");
   
   // Create message with explicit sender
   session.createMessage("Tool result", "assistant");
   ```

2. **Role Determination**
   ```typescript
   // In SessionContext
   private determineMessageRole(message: Message): "system" | "user" | "assistant" {
     const sender = message.metadata?.sender.toLowerCase();
     if (sender.includes('agent') || sender.includes('assistant')) {
       return "assistant";  // Both agent and assistant map to assistant
     } else if (sender === 'system') {
       return "system";
     }
     return "user";  // Default role
   }
   ```

3. **Common Message Types**
   - User Messages: Created with session owner as sender
   - LLM Responses: Created with "assistant" as sender
   - Tool Results: Created with "assistant" as sender
   - System Messages: Created with "system" as sender

4. **OpenAI Compatibility**
   - Internal sender metadata preserved for framework use
   - Automatically mapped to OpenAI-compatible roles when sending to LLM
   - Maintains semantic clarity while ensuring API compatibility

## Prompt Construction and LLM Interaction

### PromptLLM and PromptManager Relationship

The `promptLLM` method in AgentCore works closely with PromptManager to construct and send prompts to the LLM:

```typescript
// In AgentCore
private async promptLLM(message: Message): Promise<string> {
    const sessionContext = this.sessionContextManager[message.sessionId];
    const context = await this.memory.generateContext(sessionContext);

    // Get prompts through PromptManager
    const systemPrompt = await this.promptManager.getSystemPrompt(sessionContext, this.memory);
    const assistantPrompt = await this.promptManager.getAssistantPrompt(sessionContext, this.memory);

    // Construct final message array
    const messages = [
        { role: "system", content: systemPrompt },
        { role: "assistant", content: assistantPrompt },
        ...history,
        // user message
    ];

    // Send to LLM and get response
}
```

The PromptManager acts as a mediator between AgentCore and PromptTemplate:
1. **Prompt Assembly**: Combines system state (role, goal, capabilities) with template structure
2. **Context Integration**: Incorporates session context and memory into prompts
3. **Template Delegation**: Delegates actual prompt formatting to the PromptTemplate
4. **Variable Substitution**: Handles dynamic variable replacement in prompts

### Classifier-PromptTemplate Pairs

The framework supports different Classifier-PromptTemplate pairs to enable various interaction patterns. Each pair is designed to work together to handle specific types of interactions.

#### Available Pairs:
1. **Simple Pair**
   - SimpleClassifier: Basic message type classification
   - SimplePromptTemplate: Direct instruction-based prompts
   
2. **ReAct Pair**
   - ReActClassifier: Handles reasoning and action steps
   - ReActPromptTemplate: Structured prompts for multi-step reasoning

#### How Pairs Work Together:

1. **Template-Classifier Alignment**
```typescript
// In BaseAgent
protected createClassifier(schemaTypes: T): K {
    const ClassifierClass = this.useClassifierClass(schemaTypes);
    return new ClassifierClass();
}

protected createPromptTemplate(classificationTypes: T): P {
    const PromptTemplateClass = this.usePromptTemplateClass();
    return new PromptTemplateClass(classificationTypes);
}
```

2. **Response Format Agreement**
- PromptTemplate defines the expected response format
- Classifier knows how to parse and validate that format
```typescript
// ReActPromptTemplate example
{
    "question_nature": "SIMPLE/COMPLEX",
    "context": { ... },
    "primary_action": {
        "response_purpose": "DIRECT_RESPONSE/TOOL_INVOCATION",
        "response_content": { ... }
    }
}
```

3. **Classification Flow**
```typescript
// ReActClassifier example
protected parseLLMResponse(response: string): {
    if (parsed?.primary_action?.response_purpose === 'TOOL_INVOCATION') {
        // Handle tool invocation
    } else {
        // Handle direct response
    }
}
```

#### Implementing New Pairs:

To implement a new interaction pattern:

1. **Define Response Format**
   ```typescript
   interface CustomResponse {
       messageType: string;
       // Custom fields
   }
   ```

2. **Create Classifier and Template Classes**
   ```typescript
   class CustomClassifier<T extends readonly ClassificationTypeConfig[]> extends AbstractClassifier<T> {
       protected parseLLMResponse(response: string) {
           // Custom parsing logic
       }
   }

   class CustomTemplate<T extends readonly ClassificationTypeConfig[]> implements IAgentPromptTemplate {
       // Custom prompt generation
   }
   ```

3. **Create Custom Agent**
   ```typescript
   class CustomAgent<T extends readonly ClassificationTypeConfig[]> extends BaseAgent<
       T,
       CustomClassifier<T>,
       CustomTemplate<T>
   > {
       protected useClassifierClass(schemaTypes: T) {
           return CustomClassifier;
       }

       protected usePromptTemplateClass() {
           return CustomTemplate;
       }
   }
   ```

This design philosophy allows for:
- Type-safe implementation of new interaction patterns
- Compile-time verification of classifier-template compatibility
- Proper generic type propagation through the system
- Clean integration with the existing agent framework

## Encapsulated Protocol Pattern in Classifier-Template Pairs

The classifier-template pairs in the framework demonstrate what we might call an "Encapsulated Protocol Pattern" or "Self-Contained Protocol Pattern". This design approach has several key characteristics:

### 1. Protocol Encapsulation

Each classifier-template pair defines and manages its own complete communication protocol with the LLM:

```typescript
// ReAct Protocol Example
class ReActPromptTemplate {
    // Defines the expected format in prompts
    getSystemPrompt(): string {
        return `Your response must be in this JSON format:
        {
            "question_nature": "SIMPLE" | "COMPLEX",
            "primary_action": {
                "response_purpose": "DIRECT_RESPONSE" | "TOOL_INVOCATION",
                ...
            }
        }`;
    }
}

class ReActClassifier {
    // Handles the same format in responses
    protected parseLLMResponse(response: string) {
        const parsed = JSON.parse(response);
        if (parsed?.primary_action?.response_purpose === 'TOOL_INVOCATION') {
            // Handle according to protocol
        }
    }
}
```

### 2. Protocol Independence

Each pair's protocol is completely independent of other pairs:

- **Bare Protocol**: Raw text responses
- **Simple Protocol**: Basic JSON with messageType
- **ReAct Protocol**: Complex reasoning structure

The framework itself remains agnostic to these protocols, only requiring adherence to the base interfaces.

### 3. Protocol Cohesion

The template and classifier in each pair are tightly cohesive:
- Template defines response format expectations
- Classifier understands and processes those exact formats
- Neither depends on external format knowledge

### 4. Protocol Boundaries

Each pair forms a clear protocol boundary:

```typescript
// Input Boundary
PromptTemplate → LLM Request Format
// Output Boundary
LLM Response → Classifier → Standardized Internal Format
```

The pair handles all protocol-specific logic within these boundaries.

### 5. Implementation Patterns

This pattern manifests in different ways across implementations:

1. **Bare Implementation**
   - Minimal protocol: raw text
   - Complete handling within the pair
   - No external format dependencies

2. **Simple Implementation**
   - Basic JSON protocol
   - Self-contained message type handling
   - Independent validation rules

3. **ReAct Implementation**
   - Complex reasoning protocol
   - Complete tool invocation handling
   - Self-contained validation and parsing

### Benefits of This Pattern

1. **Protocol Isolation**
   - Changes to one protocol don't affect others
   - Each pair can evolve independently
   - Clear boundaries for testing and maintenance

2. **Implementation Freedom**
   - New pairs can define any protocol they need
   - No constraints from other implementations
   - Full control over format and handling

3. **Maintainability**
   - Protocol changes contained within the pair
   - Clear responsibility boundaries
   - Simplified testing and validation

4. **Extensibility**
   - New protocols can be added without system changes
   - Existing protocols can be enhanced independently
   - Clear pattern for implementing new pairs

### Design Implications

This pattern suggests several best practices:

1. **Keep Protocols Self-Contained**
   - Define complete format specifications
   - Handle all protocol-specific logic
   - Maintain protocol independence

2. **Respect Protocol Boundaries**
   - Don't leak protocol details
   - Convert to standard formats at boundaries
   - Maintain clear interfaces

3. **Ensure Protocol Cohesion**
   - Keep template and classifier tightly coupled
   - Maintain format consistency
   - Handle all cases within the pair

This "Encapsulated Protocol Pattern" enables the framework to support multiple interaction patterns while maintaining clean separation and clear responsibilities. Each pair acts as a self-contained unit managing its own protocol, while the framework provides the structure for these protocols to operate within.

## Response Type Handling in Different Implementations

Each classifier-template pair handles response types differently:

1. **Bare Implementation**
   - No concept of `TOOL_INVOCATION` or `DIRECT_RESPONSE`
   - All responses treated as direct answers
   - Uses first schema type for all responses
   ```typescript
   // BareClassifier response format
   {
       messageType: firstType.name,
       content: "raw response"
   }
   ```

2. **Simple Implementation**
   - Basic recognition of `TOOL_INVOCATION`
   - Simple JSON structure
   - No complex reasoning or action steps
   ```typescript
   // SimpleClassifier response format
   {
       messageType: "DIRECT_RESPONSE" | "TOOL_INVOCATION",
       content: string | { name: string, parameters: any }
   }
   ```

3. **ReAct Implementation**
   - Full implementation of ReAct pattern
   - Complex response structure with reasoning
   - Dedicated tool invocation format
   ```typescript
   // ReActClassifier response format
   {
       question_nature: "SIMPLE" | "COMPLEX",
       primary_action: {
           response_purpose: "DIRECT_RESPONSE" | "TOOL_INVOCATION",
           response_content: {
               name?: string,
               parameters?: any,
               message?: string
           }
       }
   }
   ```

The `TOOL_INVOCATION`/`DIRECT_RESPONSE` dichotomy is most fully realized in the ReAct implementation, where it's part of a larger structured reasoning pattern. Other implementations either don't use these concepts (Bare) or use them in a simplified way (Simple).

This shows how the framework allows different levels of response handling:
- **Bare**: For simple, direct responses
- **Simple**: For basic tool usage without complex reasoning
- **ReAct**: For full reasoning and tool integration

When implementing a new classifier-template pair, you can choose your own response format and handling strategy - you're not required to use the `TOOL_INVOCATION`/`DIRECT_RESPONSE` pattern unless it fits your needs.

## ReAct Message Flow Deep Dive

This section traces the complete message flow in a ReAct-based agent implementation, from user input to final output.

### 1. User/Application to Agent Flow

```
User/App → Session.chat() → AgentCore.receive() → PriorityInbox.enqueue()
```

1. **Entry Point**
   ```typescript
   // In Session
   public async chat(message: string, sender: string = this.owner): Promise<void> {
       const msg = this.createMessage(message, sender);
       this.core.receive(msg);
   }
   ```

2. **Message Processing**
   ```typescript
   // In AgentCore
   private async processMessage(message: Message): Promise<void> {
       const sessionContext = this.sessionContextManager[message.sessionId];
       sessionContext.addMessage(message);
       await this.memory.processMessage(message, sessionContext);
       
       const response = await this.promptLLM(message);
       // ...
   }
   ```

### 2. Agent to LLM Flow

```
AgentCore.promptLLM() → PromptManager → ReActPromptTemplate → LLM
```

1. **Prompt Construction**
   ```typescript
   // In AgentCore.promptLLM
   const systemPrompt = await this.promptManager.getSystemPrompt(sessionContext, this.memory);
   const assistantPrompt = await this.promptManager.getAssistantPrompt(sessionContext, this.memory);

   const messages = [
       { role: "system", content: systemPrompt },
       { role: "assistant", content: assistantPrompt },
       ...history
   ];
   ```

2. **LLM Response Format (ReAct)**
   ```json
   {
       "question_nature": "COMPLEX",
       "primary_action": {
           "response_purpose": "TOOL_INVOCATION",
           "response_content": {
               "name": "tool_name",
               "parameters": { ... }
           }
       }
   }
   ```

### 3. LLM Response Processing Flow

```
LLM Response → ReActClassifier.parseLLMResponse() → Session Handlers
```

1. **Response Classification**
   ```typescript
   // In ReActClassifier
   protected parseLLMResponse(response: string): {
       const parsed = JSON.parse(response);
       
       if (parsed?.primary_action?.response_purpose === 'TOOL_INVOCATION') {
           return {
               isToolCall: true,
               instruction: 'TOOL_INVOCATION',
               parsedLLMResponse: toolResponse,
               // ...
           };
       }
       // Handle direct response
   }
   ```

2. **Handler Selection**
   - For `TOOL_INVOCATION`:
     ```typescript
     // In Session
     public async triggerToolCallsHandlers(result: any): Promise<void> {
         this.toolResultHandlers.forEach(handler => {
             if (typeof handler === 'function') {
                 handler(result, this);
             }
         });
     }
     ```
   
   - For `DIRECT_RESPONSE`:
     ```typescript
     // In Session
     public async triggerConversationHandlers(response: any): Promise<void> {
         this.conversationHandlers.forEach(handler => {
             if (typeof handler === 'function') {
                 handler(response);
             }
         });
     }
     ```

### 4. Tool Execution Flow (for TOOL_INVOCATION)

```
Tool.execute() → Tool Result → Session.triggerToolResultHandlers() → New LLM Request
```

1. **Tool Execution**
   ```typescript
   // In Session
   const tool = this.core.getTool(toolName);
   const result = await tool.run(obj, {});
   ```

2. **Result Processing**
   ```typescript
   // Result sent back to LLM for further processing
   const msg = this.createMessage(result, "system");
   this.core.receive(msg);
   ```

### 5. Final Response Flow

```
Final Response → Session Handlers → User/Application
```

1. **Handler Registration**
   ```typescript
   session.onConversation((response) => {
       // Handle direct responses
   });
   
   session.onToolResult((result) => {
       // Handle tool results
   });
   ```

2. **Response Delivery**
   - Direct responses go to conversation handlers
   - Tool results go to tool result handlers
   - Events go to event handlers
   - Exceptions go to exception handlers

### Complete Flow Example

For a typical ReAct interaction:

1. User sends message → `session.chat()`
2. Message queued → `PriorityInbox`
3. Message processed → `AgentCore.processMessage()`
4. Prompt constructed → `PromptManager` + `ReActPromptTemplate`
5. LLM responds → `ReActClassifier.parseLLMResponse()`
6. If `TOOL_INVOCATION`:
   - Tool executed
   - Result sent back to LLM
   - New response generated
7. If `DIRECT_RESPONSE`:
   - Response sent to conversation handlers
8. Final result delivered to user/application

This flow demonstrates how the ReAct implementation:
- Maintains conversation context
- Handles multi-step reasoning
- Integrates tool execution
- Delivers results through appropriate channels

## Classifier-PromptTemplate Design Philosophy

The framework implements a pluggable system for different interaction patterns through Classifier-PromptTemplate pairs. Each pair represents a complete "mini-system" for handling agent interactions, with its own conventions and response formats.

### Core Design Principles

1. **Pluggable Mini-Systems**
   - Each pair is self-contained with its own response format and parsing logic
   - Pairs can be swapped out without changing the core framework
   - Different pairs can support different interaction patterns

2. **Progressive Complexity**
   The framework provides three levels of implementation:

   a. **Bare Implementation**
   ```typescript
   // BareClassifier - Simplest possible implementation
   class BareClassifier<T> extends AbstractClassifier<T> {
       async classify(message: Message): Promise<string> {
           // Always return first type
           return this.schemaTypes[0].name;
       }
       
       protected parseLLMResponse(response: string): {
           // Treats all responses as direct answers
           return {
               isToolCall: false,
               instruction: firstType.name,
               parsedLLMResponse: { messageType: firstType.name, content: response },
               answer: response
           };
       }
   }
   ```

   b. **Simple Implementation**
   ```typescript
   // SimpleClassifier - Basic JSON parsing with type validation
   class SimpleClassifier<T> extends AbstractClassifier<T> {
       protected parseLLMResponse(response: string): {
           const parsed = JSON.parse(response);
           const messageType = parsed.messageType;
           // Validates message type against schema
           // Basic structure validation
           return {
               isToolCall: messageType === "TOOL_INVOCATION",
               instruction: messageType,
               parsedLLMResponse: parsed,
               answer: parsed.content
           };
       }
   }
   ```

   c. **ReAct Implementation**
   ```typescript
   // ReActClassifier - Full reasoning and action support
   class ReActClassifier<T> extends AbstractClassifier<T> {
       protected parseLLMResponse(response: string): {
           const parsed = JSON.parse(response);
           // Complex parsing with tool invocation support
           if (parsed?.primary_action?.response_purpose === 'TOOL_INVOCATION') {
               // Handle tool calls
           }
           // Handle direct responses
           // Full schema validation
       }
   }
   ```

3. **Common Interface, Different Capabilities**
   - All classifiers implement `AbstractClassifier`
   - All templates implement `IAgentPromptTemplate`
   - Each pair adds its own capabilities while maintaining interface compatibility

### Design Benefits

1. **Flexibility Through Abstraction**
   - Core system only depends on abstract interfaces
   - New interaction patterns can be added without core changes
   - Different agents can use different interaction patterns

2. **Progressive Enhancement**
   - Start with bare implementation for simple cases
   - Move to simple implementation for basic structure
   - Use ReAct implementation for complex reasoning

3. **Self-Contained Logic**
   - Each pair handles its own response format
   - Parsing and validation are encapsulated
   - Templates match classifier expectations

### Implementation Patterns

1. **Response Format Definition**
   - Each pair defines its expected response format
   - Format complexity matches use case
   - Validation matches format requirements

2. **Error Handling**
   - Progressive error handling complexity
   - Bare: minimal error checking
   - Simple: basic structure validation
   - ReAct: full schema validation

3. **Tool Integration**
   - Optional tool support
   - Bare: no tool support
   - Simple: basic tool invocation
   - ReAct: full reasoning and tool integration

### Extensibility Model

To create a new interaction pattern:

1. **Define Response Format**
   ```typescript
   interface CustomResponse {
       messageType: string;
       // Custom fields
   }
   ```

2. **Create Classifier and Template Classes**
   ```typescript
   class CustomClassifier<T extends readonly ClassificationTypeConfig[]> extends AbstractClassifier<T> {
       protected parseLLMResponse(response: string) {
           // Custom parsing logic
       }
   }

   class CustomTemplate<T extends readonly ClassificationTypeConfig[]> implements IAgentPromptTemplate {
       // Custom prompt generation
   }
   ```

3. **Create Custom Agent**
   ```typescript
   class CustomAgent<T extends readonly ClassificationTypeConfig[]> extends BaseAgent<
       T,
       CustomClassifier<T>,
       CustomTemplate<T>
   > {
       protected useClassifierClass(schemaTypes: T) {
           return CustomClassifier;
       }

       protected usePromptTemplateClass() {
           return CustomTemplate;
       }
   }
   ```

This design philosophy allows for:
- Type-safe implementation of new interaction patterns
- Compile-time verification of classifier-template compatibility
- Proper generic type propagation through the system
- Clean integration with the existing agent framework

## Message Processing Pipeline

1. **Message Reception**
   ```
   User/App Input or LLM Response
   ↓
   Session.chat() or Core.receive()
   ↓
   PriorityInbox.enqueue()
   ```

2. **Message Processing**
   ```
   PriorityInbox.processMessage()
   ↓
   Core.processMessage()
   ↓
   Memory.processMessage() // Context update
   ↓
   Core.promptLLM() // For user messages
   ```

3. **Prompt Construction**
   ```
   PromptManager
   ↓
   PromptTemplate
   ↓
   System/Assistant/User prompts
   ↓
   LLM
   ```

4. **Response Handling**
   ```
   LLM Response
   ↓
   Classifier.handleLLMResponse()
   ↓
   DIRECT_RESPONSE → Session.conversationHandlers
   or
   TOOL_INVOCATION → Tool.execute() → Session.toolResultHandlers
   ```

## Tool Integration

Tools are integrated into the framework through:
1. **Registration**: Tools are registered with AgentCore
2. **Invocation**: Triggered by TOOL_INVOCATION responses
3. **Result Processing**: Results are sent back to LLM for further processing
4. **Response Generation**: Final responses are sent to user/application

## Memory and Context Management

The framework maintains different types of memory:
- Short-term: Recent conversation context
- Long-term: Persistent knowledge
- Working: Current session state

Context is managed through:
- SessionContext: Per-conversation state
- Memory: Historical information
- ExecutionContext: Runtime environment

## Error Handling

Errors are handled at multiple levels:
1. Message processing errors
2. Tool execution errors
3. LLM response parsing errors
4. Validation errors

Each error type has specific handlers and recovery mechanisms.

## Extension Points

The framework can be extended through:
1. Custom PromptTemplates and matching Classifiers
2. Custom Tools
3. Custom Memory implementations
4. Custom Handlers
5. Custom Interaction Patterns

## Best Practices

1. **Message Handling**
   - Always use proper message wrapping
   - Maintain session context
   - Handle all response types

2. **Prompt Management**
   - Use structured prompts
   - Maintain conversation context
   - Include necessary instructions

3. **Tool Integration**
   - Properly validate inputs/outputs
   - Handle errors gracefully
   - Provide clear feedback

4. **Error Handling**
   - Implement proper error recovery
   - Maintain system stability
   - Provide meaningful error messages

## Appendix: Implementation Examples

Here are some common patterns and examples for implementing agents:

### Basic Agent Implementation
```typescript
// Example of creating a basic agent with direct responses
const basicAgent = new BareAgent({
    instructions: ["greeting", "farewell"],
    tools: [new SimpleTool()]
});
```

### ReAct Agent Implementation
```typescript
// Example of creating a ReAct agent with reasoning capabilities
const reactAgent = new ReActAgent({
    instructions: loadInstructions("brain.md"),
    tools: [new FileSearchTool(), new AgentGenerator()]
});
```

### Common Use Cases
1. **Simple Chat Agent**
   - Use BareAgent for direct conversations
   - Minimal configuration needed

2. **Tool-Using Agent**
   - Use SimpleAgent for basic tool integration
   - Register tools directly

3. **Complex Reasoning Agent**
   - Use ReActAgent for multi-step tasks
   - Configure with instructions and tools
   - Enable full reasoning capabilities

## Glossary

- **Agent**: An AI entity that processes messages and performs actions
- **Instruction**: A structured directive defining expected behavior
- **Tool**: A function that can be called by the agent
- **Classification Type**: A category for LLM responses
- **Prompt Template**: A structured format for LLM communication
- **Protocol**: A pattern for agent-LLM interaction
- **Session**: A conversation context between user and agent
