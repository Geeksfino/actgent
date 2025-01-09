# Memory System Testing Guidelines

## How It Should Work

To integrate memory-management and context-management into an agent framework for prompt construction, we follow a systematic flow. Here's how these components work together to construct effective prompts for an agent's interaction with an LLM.

### Workflow Steps

#### 1. User Input
- The user sends a query or task to the agent, initiating the conversation.

#### 2. History Management (SmartHistoryManager)
- **Action**: The user's message is added to the SmartHistoryManager, which:
  1. Stores the message in its internal message list
  2. Updates metrics like token count, message relevance, and age
  3. Checks optimization triggers and applies necessary optimizers (e.g., summarization, relevance filtering, time decay)
- **Output**: A list of optimized messages relevant to the current interaction

#### 3. Memory Retrieval (AgentMemorySystem)
- **Action**: The agent's AgentMemorySystem retrieves relevant information from:
  1. Working Memory: Immediate, transient memories associated with the task
  2. Episodic Memory: Related past conversations or experiences
  3. Semantic Memory: General knowledge or structured data (facts, rules)
- **Output**: A consolidated memory object containing:
  - Contextually relevant short-term and long-term memories
  - Relevant summaries or metadata extracted from the memory

#### 4. Context Construction (EnhancedContextManager)
- **Action**: The EnhancedContextManager combines:
  1. Optimized conversation history from SmartHistoryManager
  2. Retrieved memory data from AgentMemorySystem
  3. Additional environmental context (current time, location, user-specific metadata)
- **Processing**:
  - Ensures no token limit breaches by prioritizing, summarizing, or trimming
  - Structures the data into a coherent context object

#### 5. Prompt Construction
- **Action**: The agent constructs a prompt using:
  1. System Prompt: Base instructions for the agent's behavior and task goals
  2. Conversation Context: Relevant and optimized conversation history
  3. Memory Data: Additional contextual knowledge retrieved in step 3
  4. User Input: The latest user message
- **Processing**:
  - Converts structured data (summaries, key points) into a human-readable format
  - Integrates memory-based context fluently within the conversation history
- **Output**: A structured, ready-to-use prompt

#### 6. Submission to LLM
- The constructed prompt is sent to the LLM for a response

#### 7. Post-Processing
- The response is:
  1. Parsed for structured data or direct action instructions
  2. Stored back into the SmartHistoryManager
  3. Used to update the AgentMemorySystem if new knowledge or insights are introduced

### Example Flow

For a user query "What did we discuss last time about project X?":

1. **User Input**: Message received
2. **History Management**:
   ```typescript
   {
     messages: [
       "User: Tell me about project X",
       "Agent: Project X involves ... (summarized)"
     ]
   }
   ```

3. **Memory Retrieval**:
   ```typescript
   {
     episodic: ["Previous meeting notes tagged with 'Project X'"],
     semantic: ["Background knowledge on project domain"],
     working: ["Unresolved action items"]
   }
   ```

4. **Context Construction**:
   ```typescript
   {
     history: ["You discussed Project X and its milestones."],
     episodicMemory: ["Milestones: A, B, C."],
     semanticMemory: ["Background: Project X is a software initiative."]
   }
   ```

5. **Prompt Construction**:
   ```typescript
   {
     systemPrompt: "You are an assistant specializing in project management...",
     conversationHistory: [
       "User: What did we discuss last time about Project X?",
       "Agent: You discussed Project X and its milestones."
     ],
     memoryContext: "Milestones: A, B, C. Background: Project X is a software initiative.",
     userInput: "What did we discuss last time about Project X?"
   }
   ```

### Framework Integration

- The memory-management and context-management packages remain modular
- The Agent Core is responsible for:
  - Managing dependencies between SmartHistoryManager, AgentMemorySystem, and EnhancedContextManager
  - Facilitating the flow from input to LLM interaction
- Developers only configure and extend metrics, optimizers, and memory types as needed

## Core Testing Principles

### 1. Memory Unit Creation
- Always use the provided test helper functions (`createTestMemory`, `createWorkingMemory`, etc.)
- Ensure consistent timestamp usage across tests (use a fixed reference time)
- Include all required metadata fields based on memory type

### 2. Memory Type Handling
```typescript
// Working Memory
metadata.set('type', MemoryType.WORKING);
metadata.set('expiresAt', now + timeToLive);

// Long-term Memory
metadata.set('type', MemoryType.EPISODIC | SEMANTIC | etc);
metadata.set('consolidationStatus', ConsolidationStatus.CONSOLIDATED);
```

### 3. Memory Filtering
- Use consistent filter structures across all tests
- Include only necessary filter fields
- For type filtering, always use the types array:
```typescript
const filter: MemoryFilter = {
    types: [MemoryType.WORKING]
};
```

### 4. Metadata Handling
- Always use Map<string, any> for metadata
- Ensure metadata is properly cloned when needed
- Follow standard metadata keys:
  - 'type': MemoryType
  - 'expiresAt': number (timestamp)
  - 'consolidationStatus': ConsolidationStatus
  - 'relevance': number
  - 'contextKey': string

### 5. Mock Implementation Requirements
The mock storage implementation must:
- Handle metadata as Map objects
- Properly implement type filtering
- Respect memory expiration
- Handle all filter types consistently
- Match real implementation behavior

## Test Categories

### 1. Storage Tests
```typescript
// Basic storage
await memory.store(content, metadata);
const retrieved = await memory.retrieve({ types: [type] });
expect(retrieved.length).toBe(1);

// Batch storage
await memory.batchStore(memories);
const retrieved = await memory.retrieve({ types: [type] });
expect(retrieved.length).toBe(memories.length);
```

### 2. Retrieval Tests
```typescript
// By type
const typeFilter = { types: [MemoryType.WORKING] };

// By metadata
const metadataFilter = {
    types: [MemoryType.WORKING],
    metadataFilters: [new Map([['key', 'value']])]
};

// By date range
const dateFilter = {
    types: [MemoryType.WORKING],
    dateRange: { start: new Date(), end: new Date() }
};
```

### 3. Expiration Tests
```typescript
// Test expired memory
const expiredMetadata = new Map([
    ['type', MemoryType.WORKING],
    ['expiresAt', now - 1000] // Already expired
]);

// Test non-expired memory
const validMetadata = new Map([
    ['type', MemoryType.WORKING],
    ['expiresAt', now + 10000] // Not expired yet
]);
```

### 4. Update Tests
```typescript
// Store initial memory
await memory.store(content, metadata);

// Update memory
const retrieved = await memory.retrieve({ types: [type] });
retrieved[0].content = updatedContent;
await memory.update(retrieved[0]);

// Verify update
const updated = await memory.retrieve({ types: [type] });
expect(updated[0].content).toEqual(updatedContent);
```

## Common Pitfalls to Avoid

1. **Timestamp Inconsistency**
   - Use a consistent time reference across tests
   - Don't rely on current time in tests
   - Always set explicit timestamps for predictable behavior

2. **Metadata Handling**
   - Don't mix Map and object literal metadata
   - Always clone metadata when modifying
   - Ensure all required metadata fields are present

3. **Filter Construction**
   - Don't use deprecated filter fields
   - Always include type in filters
   - Use proper filter field types

4. **Mock Implementation**
   - Don't simplify mock behavior
   - Implement all required interface methods
   - Match real implementation behavior exactly

## Test Data Creation

### 1. Standard Test Data
```typescript
const standardContent = { text: 'test memory' };
const standardMetadata = new Map([
    ['type', MemoryType.WORKING],
    ['expiresAt', now + 10000]
]);
```

### 2. Test Helper Usage
```typescript
// Use helpers consistently
const memory = createWorkingMemory(
    content,
    now + 10000,
    { additionalMetadata: new Map() }
);

// Don't create raw memory objects
const memory = {
    id: '123',
    content: content,
    metadata: metadata
}; // Wrong!
```

## Integration Test Specifics

1. **Test Order**
   - Tests should be independent
   - Clean up after each test
   - Don't rely on test execution order

2. **System Integration**
   - Test memory system components together
   - Verify cross-component interactions
   - Test consolidation and association flows

3. **Error Handling**
   - Test error conditions
   - Verify error propagation
   - Check cleanup after errors

## Unit Test Specifics

1. **Component Isolation**
   - Mock dependencies properly
   - Test single responsibility
   - Verify component contracts

2. **Edge Cases**
   - Test boundary conditions
   - Verify error handling
   - Check invalid inputs

3. **Mock Behavior**
   - Match real implementation
   - Implement full interface
   - Handle all scenarios

## Testing Agent Prompt Construction Workflow

### Overview
The memory and context management systems must work together to support the agent's prompt construction workflow. This section outlines how to test this critical flow.

### 1. Testing Message History Management

```typescript
// Test history optimization triggers
test('should trigger optimization when token count exceeds limit', async () => {
    const historyManager = new SmartHistoryManager({
        maxTokens: 1000,
        optimizers: [new SummarizationOptimizer()]
    });
    
    // Add messages until optimization trigger
    for (let i = 0; i < 10; i++) {
        await historyManager.addMessage({
            role: 'user',
            content: 'Long message that will contribute to token count...'
        });
    }
    
    const history = await historyManager.getOptimizedHistory();
    expect(history.length).toBeLessThan(10); // Should be optimized
    expect(historyManager.getCurrentTokenCount()).toBeLessThan(1000);
});
```

### 2. Testing Memory Integration

```typescript
// Test memory retrieval for prompt context
test('should retrieve relevant memories for prompt construction', async () => {
    const memorySystem = new AgentMemorySystem();
    
    // Store some test memories
    await memorySystem.storeLongTerm({
        content: 'Project X milestone A completed',
        metadata: new Map([
            ['type', MemoryType.EPISODIC],
            ['project', 'X'],
            ['category', 'milestone']
        ])
    });
    
    // Retrieve memories for prompt
    const memories = await memorySystem.retrieveMemories({
        types: [MemoryType.EPISODIC],
        metadataFilters: [new Map([['project', 'X']])]
    });
    
    expect(memories.length).toBeGreaterThan(0);
    expect(memories[0].content).toContain('Project X');
});
```

### 3. Testing Context Construction

```typescript
// Test context assembly from multiple sources
test('should construct context from history and memory', async () => {
    const contextManager = new EnhancedContextManager({
        historyManager,
        memorySystem
    });
    
    // Add some history
    await historyManager.addMessage({
        role: 'user',
        content: 'Tell me about project X'
    });
    
    // Add some memories
    await memorySystem.storeLongTerm({
        content: 'Project X details',
        metadata: new Map([
            ['type', MemoryType.SEMANTIC],
            ['project', 'X']
        ])
    });
    
    // Get constructed context
    const context = await contextManager.constructContext({
        query: 'project X',
        maxTokens: 500
    });
    
    expect(context).toHaveProperty('history');
    expect(context).toHaveProperty('memories');
    expect(context.totalTokens).toBeLessThanOrEqual(500);
});
```

### 4. Testing Full Prompt Construction Flow

```typescript
// Test end-to-end prompt construction
test('should construct complete prompt with all components', async () => {
    const agent = new Agent({
        historyManager,
        memorySystem,
        contextManager
    });
    
    // Setup test data
    await setupTestConversationHistory();
    await setupTestMemories();
    
    // Trigger prompt construction
    const prompt = await agent.constructPrompt({
        userInput: 'What did we discuss about project X?',
        maxTokens: 2000
    });
    
    // Verify prompt structure
    expect(prompt).toHaveProperty('systemPrompt');
    expect(prompt).toHaveProperty('conversationHistory');
    expect(prompt).toHaveProperty('memoryContext');
    expect(prompt).toHaveProperty('userInput');
    
    // Verify content integration
    expect(prompt.memoryContext).toContain('Project X');
    expect(prompt.conversationHistory).toBeDefined();
});
```

### 5. Testing Post-Processing

```typescript
// Test response processing and memory updates
test('should process LLM response and update memory', async () => {
    const response = {
        content: 'Project X milestone B was completed today',
        metadata: {
            type: 'status_update',
            project: 'X'
        }
    };
    
    await agent.processResponse(response);
    
    // Verify memory updates
    const memories = await memorySystem.retrieveMemories({
        types: [MemoryType.EPISODIC],
        metadataFilters: [new Map([['project', 'X']])]
    });
    
    expect(memories).toContainEqual(
        expect.objectContaining({
            content: expect.stringContaining('milestone B')
        })
    );
});
```

### Integration Test Scenarios

1. **Conversation Continuity**
   - Test that context maintains coherence across multiple turns
   - Verify memory retrieval relevance improves with conversation context
   - Check that history optimization preserves critical information

2. **Memory Consolidation**
   - Test working memory to long-term memory conversion
   - Verify context updates trigger appropriate memory consolidation
   - Check that consolidated memories maintain associations

3. **Token Management**
   - Test that context construction respects token limits
   - Verify optimization triggers work correctly
   - Check that critical information is preserved when trimming

4. **Error Recovery**
   - Test system behavior with missing or corrupted memories
   - Verify graceful degradation of context quality
   - Check recovery mechanisms for failed optimizations

### Performance Considerations

1. **Latency Requirements**
   - Context construction should complete within 100ms
   - Memory retrieval should complete within 50ms
   - History optimization should not block user interaction

2. **Memory Usage**
   - Monitor memory usage during context construction
   - Verify cleanup of temporary context objects
   - Check for memory leaks in long-running conversations

3. **Optimization Triggers**
   - Test automatic optimization timing
   - Verify optimization effectiveness
   - Monitor impact on response quality
