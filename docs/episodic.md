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

## Bi-temporal Model

The graph implements a bi-temporal model with two distinct timelines:

- **T timeline** (`validAt`): When events actually occurred in the conversation
- **T' timeline** (`createdAt`): When data was ingested into the system

This allows tracking both the chronological order of conversations and the system's processing order.

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
