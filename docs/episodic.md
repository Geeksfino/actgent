# Episodic Graph Design

This document outlines the design and implementation of the episodic graph layer in our framework, based on the Zep paper's architecture.

## Core Concepts

The episodic graph represents the raw conversation data and entity mentions as they appear in the text, before any semantic processing or entity resolution occurs. It follows a bi-temporal model to track both when events occurred and when they were ingested into the system.

### Key Components

1. **Episodes**: Raw data containers (not nodes)
   - Store unprocessed conversation turns
   - Maintain conversation metadata
   - Serve as source material for entity extraction

2. **Entity Mention Nodes**:
   - Represent raw mentions of entities in the text
   - Connected to their source episodes
   - No premature entity resolution

3. **Relationship Edges**:
   - Connect entity mentions (not resolved entities)
   - Represent relationships as they are mentioned in conversation
   - Include temporal metadata

## Entity and Relationship Processing

### Entity Mentions
- Each distinct entity mention within a turn is represented by a unique node
- Mentions are uniquely identified by the combination of:
  - Turn number
  - Entity type (e.g., PERSON, LOCATION)
  - Mention text
- Multiple occurrences of the same entity within a turn are consolidated into a single node
- Each mention node contains:
  ```typescript
  {
    type: string,           // Entity type (e.g., PERSON, LOCATION)
    content: {
      mention: string,      // The raw text of the mention
      turn: number         // The turn where this mention occurred
    },
    metadata: {
      turn: string,        // Turn number as string
      timestamp: string    // ISO timestamp of when the mention occurred
    }
  }
  ```

### Relationships
- Relationships connect mention nodes directly
- Each relationship captures:
  - Type (e.g., IS_A, ALSO_KNOWN_AS)
  - Source and target mention nodes
  - Turn number
  - Temporal context (when the relationship was observed)
  - Confidence score

### Design Principles
1. **Raw Mention Preservation**: The episodic graph captures raw mentions as they appear in the conversation, without premature entity resolution
2. **Temporal Context**: Each node and relationship maintains its temporal context through turn numbers and timestamps
3. **Deduplication**: Multiple mentions of the same entity within the same turn are consolidated into a single node
4. **Entity Resolution**: Entity resolution is deferred to the semantic layer, allowing the episodic graph to focus on capturing the raw conversation structure

### Example
For the conversation:
```
Turn 0: "George Orwell is a British author"
Turn 1: "He is also known as Eric Blair"
```

The graph would contain:
- Nodes:
  - Turn 0: "George Orwell" (PERSON)
  - Turn 0: "British author" (PROFESSION)
  - Turn 1: "Eric Blair" (PERSON)
- Relationships:
  - IS_A: "George Orwell" -> "British author" (Turn 0)
  - ALSO_KNOWN_AS: "George Orwell" -> "Eric Blair" (Turn 1)

## Bi-temporal Model

The graph implements a bi-temporal model with two distinct timelines:

- **T timeline** (`validAt`): When information appeared in the conversation
  - For episodes: When the conversation message was sent
  - For entity mentions: When they appeared in conversation
  - For relationships: When they were stated in conversation
  - Always matches the timestamp of the conversation turn where the information appeared
  
- **T' timeline** (`createdAt`): When data was ingested into the system
  - Always uses the current system time when the data is processed
  - Represents when we learned about the information
  - Used to track data freshness and processing order

This bi-temporal approach allows us to:
1. Track when information was mentioned in conversations (T timeline)
2. Track when that information was processed by our system (T' timeline)
3. Support temporal queries about both conversation history and data processing

### Example Temporal Handling

```json
{
  "nodes": [
    {
      "id": "mention_1",
      "type": "Person",
      "mention": "George Orwell",
      "episode_id": "ep_turn_session_0_0",
      "validAt": "2024-01-01T10:00:00Z",    // When "George Orwell" was mentioned
      "createdAt": "2025-02-12T10:27:47+10:00"  // When we processed this mention
    }
  ],
  "edges": [
    {
      "id": "edge_1",
      "source": "mention_1",
      "target": "mention_2",
      "type": "worked_at",
      "episode_id": "ep_turn_session_0_1",
      "validAt": "2024-01-01T10:00:00Z",    // When the "worked at" relationship was mentioned
      "createdAt": "2025-02-12T10:27:47+10:00"  // When we processed this relationship
    }
  ]
}
```

### Temporal Resolution Rules

1. **Episode Timestamps**
   - `validAt`: The message timestamp
   - `createdAt`: System time when ingested

2. **Entity Mention Timestamps**
   - `validAt`: The timestamp of the turn where the mention appeared
   - `createdAt`: System time when ingested

3. **Relationship Timestamps**
   - `validAt`: The timestamp of the turn where the relationship was stated
   - `createdAt`: System time when ingested

Note: The episodic graph only tracks when information appeared in conversations. Historical dates (like publication dates or employment periods) are handled by the semantic layer, not the episodic layer.

## JSON Structure

```json
{
  "nodes": [
    {
      "id": "mention_1",
      "type": "Person",
      "mention": "Eric Blair",
      "episode_id": "ep_turn_session_0_0",
      "validAt": "2024-01-01T10:00:00.000Z",    // When mentioned in conversation
      "createdAt": "2025-02-11T21:43:10.766Z"   // When ingested into system
    }
  ],
  "edges": [
    {
      "id": "edge_1",
      "source": "mention_1",
      "target": "mention_2",
      "type": "pen_name",
      "episode_id": "ep_turn_session_0_1",
      "validAt": "2024-01-01T10:00:00.000Z",    // When relationship was mentioned
      "createdAt": "2025-02-11T21:43:10.766Z"   // When ingested into system
    }
  ],
  "episodes": [
    {
      "id": "ep_turn_session_0_0",
      "type": "message",                         // One of: message, text, JSON
      "actor": "user",
      "content": "Raw message text...",
      "metadata": {
        "session_id": "session_0",
        "turn_id": "turn_0"
      },
      "validAt": "2024-01-01T10:00:00.000Z",
      "createdAt": "2025-02-11T21:43:10.766Z"
    }
  ]
}
```

## Important Design Principles

1. **Raw Data Preservation**
   - Episodes store unmodified conversation data
   - Entity mentions preserve exact text as it appears
   - No interpretation or resolution at this layer

2. **Temporal Accuracy**
   - Node `validAt`: When the entity was mentioned
   - Edge `validAt`: When the relationship was stated
   - All temporal data based on conversation time, not external knowledge

3. **Separation of Concerns**
   - No premature entity resolution
   - No connection to semantic entities
   - No incorporation of external knowledge

4. **Episode Types**
   - message: Conversation turns
   - text: Raw text data
   - JSON: Structured data

## Processing Flow

1. **Episode Ingestion**
   - Store raw conversation data
   - Assign temporal metadata
   - Create episode container

2. **Entity Mention Extraction**
   - Extract mentions from episode text
   - Create mention nodes
   - Link to source episode

3. **Relationship Extraction**
   - Identify relationships between mentions
   - Create relationship edges
   - Maintain temporal context

## Implementation Notes

1. Entity extraction and relationship identification should be performed using:
   - Context window of last 4 messages
   - LLM-based extraction
   - Proper temporal tracking

2. All external knowledge and entity resolution should be deferred to the semantic layer:
   - Publication dates
   - Entity merging
   - Fact verification

3. The episodic graph serves as the foundation for:
   - Semantic graph construction
   - Entity resolution
   - Temporal analysis
   - Conversation reconstruction

## Detailed Example

Let's illustrate how `validAt` timestamps work with a concrete example:

**Conversation:**

* **Turn 1 (User, 2024-01-01T10:00:00.000Z):** "I'm interested in George Orwell's books, especially Animal Farm."
* **Turn 2 (Assistant, 2024-01-01T10:00:15.000Z):** "Animal Farm and 1984 are two of his most famous works. He also wrote Burmese Days, reflecting his time in British Burma."

**Episodic Graph:**

```json
{
  "nodes": [
    {
      "id": "mention_1",
      "type": "Person",
      "mention": "George Orwell",
      "episode_id": "ep_turn_session_0_0",
      "validAt": "2024-01-01T10:00:00.000Z",    // Same time as Turn 1
      "createdAt": "2025-02-12T10:32:54+10:00"  // When we processed this mention
    },
    {
      "id": "mention_2",
      "type": "Book",
      "mention": "Animal Farm",
      "episode_id": "ep_turn_session_0_0",
      "validAt": "2024-01-01T10:00:00.000Z",    // Same time as Turn 1
      "createdAt": "2025-02-12T10:32:54+10:00"
    },
    {
      "id": "mention_3",
      "type": "Book",
      "mention": "1984",
      "episode_id": "ep_turn_session_0_1",
      "validAt": "2024-01-01T10:00:15.000Z",    // Same time as Turn 2
      "createdAt": "2025-02-12T10:32:54+10:00"
    },
    {
      "id": "mention_4",
      "type": "Book",
      "mention": "Burmese Days",
      "episode_id": "ep_turn_session_0_1",
      "validAt": "2024-01-01T10:00:15.000Z",    // Same time as Turn 2
      "createdAt": "2025-02-12T10:32:54+10:00"
    },
    {
      "id": "mention_5",
      "type": "Location",
      "mention": "British Burma",
      "episode_id": "ep_turn_session_0_1",
      "validAt": "2024-01-01T10:00:15.000Z",    // Same time as Turn 2
      "createdAt": "2025-02-12T10:32:54+10:00"
    }
  ],
  "edges": [
    {
      "id": "edge_1",
      "sourceId": "mention_1",  // George Orwell
      "targetId": "mention_2",  // Animal Farm
      "type": "wrote",
      "content": {
        "type": "wrote",
        "description": "Temporal relationship between George Orwell and Animal Farm"
      },
      "metadata": {
        "episode_id": "ep_turn_session_0_1"  // Relationship stated in Turn 2
      },
      "validAt": "2024-01-01T10:00:15.000Z",    // Same time as Turn 2 (crucial!)
      "createdAt": "2025-02-12T10:32:54+10:00"
    },
    {
      "id": "edge_2",
      "sourceId": "mention_1",  // George Orwell
      "targetId": "mention_3",  // 1984
      "type": "wrote",
      "content": {
        "type": "wrote",
        "description": "Temporal relationship between George Orwell and 1984"
      },
      "metadata": {
        "episode_id": "ep_turn_session_0_1"  // Relationship stated in Turn 2
      },
      "validAt": "2024-01-01T10:00:15.000Z",    // Same time as Turn 2 (crucial!)
      "createdAt": "2025-02-12T10:32:54+10:00"
    }
  ],
  "episodes": [
    {
      "id": "ep_turn_session_0_0",
      "type": "message",
      "actor": "user",
      "content": "I'm interested in George Orwell's books, especially Animal Farm.",
      "metadata": {
        "session_id": "session_0",
        "turn_id": "turn_0"
      },
      "validAt": "2024-01-01T10:00:00.000Z",
      "createdAt": "2025-02-12T10:32:54+10:00"
    },
    {
      "id": "ep_turn_session_0_1",
      "type": "message",
      "actor": "assistant",
      "content": "Animal Farm and 1984 are two of his most famous works...",
      "metadata": {
        "session_id": "session_0",
        "turn_id": "turn_1"
      },
      "validAt": "2024-01-01T10:00:15.000Z",
      "createdAt": "2025-02-12T10:32:54+10:00"
    }
  ]
}
```

**Key Points About Temporal Handling:**

1. **Node Timestamps (`validAt`)**:
   - Each mention's `validAt` corresponds to when that specific mention occurred in the conversation
   - "George Orwell" and "Animal Farm" are mentioned in Turn 1 (10:00:00)
   - "1984", "Burmese Days", and "British Burma" are mentioned in Turn 2 (10:00:15)

2. **Edge Timestamps (`validAt`)**:
   - The crucial part is that edge `validAt` reflects when the relationship was stated
   - All relationships (wrote, lived_in) are stated in Turn 2 (10:00:15)
   - Therefore, all edges have `validAt` = 10:00:15, regardless of when the books were actually written
   - This is what makes it an episodic graph - we track when relationships were mentioned, not when they were historically true

3. **Episode Timestamps**:
   - Each episode's `validAt` is the time of that conversation turn
   - Turn 1: 10:00:00
   - Turn 2: 10:00:15

4. **Creation Time (`createdAt`)**:
   - All nodes, edges, and episodes have a `createdAt` timestamp reflecting when our system processed them
   - This is always the current system time when ingestion occurs

This example illustrates how the episodic graph captures the temporal flow of the conversation itself, rather than the historical timeline of events being discussed. Historical dates and durations are handled by the semantic layer, not the episodic layer.


