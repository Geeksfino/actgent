# Graph Processing Framework

The graph processing framework provides a layered approach to memory organization, processing information from raw messages into increasingly abstract representations. This document describes the flow of information through the system and the structure of each layer.

## Overview

The framework processes information through three main layers:

1. **Episodic Layer**: Raw, lossless storage of messages and events
2. **Entity Layer**: Extracted entities and their relationships
3. **Community Layer**: Higher-level clusters of related entities

## Processing Flow

### Layer 1: Episodic Graph

Messages are first ingested as episodic nodes, preserving the complete original content and temporal information.

```typescript
// Example episodic node
{
  id: "ep_1234",
  type: "episode",
  content: {
    body: "Alice told Bob about her new project at Google",
    timestamp: "2024-02-05T12:00:00Z"
  },
  metadata: {
    role: "user",
    turnId: "turn_123",
    sessionId: "session_456"
  },
  validAt: "2024-02-05T12:00:00Z"
}
```

### Layer 2: Entity Graph

The framework extracts entities and relationships from episodic nodes:

1. **Entity Extraction**:
   ```typescript
   // Extracted entities
   {
     id: "ent_alice",
     type: "entity",
     content: {
       name: "Alice",
       category: "PERSON",
       confidence: 0.95
     },
     metadata: {
       firstMentioned: "ep_1234",
       mentions: ["ep_1234", "ep_1235"]
     }
   }
   ```

2. **Entity Deduplication**:
   ```typescript
   // Before deduplication
   {
     "Alice": "ent_alice",
     "Alice Smith": "ent_alice_smith"
   }
   
   // After resolution
   {
     "Alice": "ent_alice",
     "Alice Smith": "ent_alice"  // Merged into single entity
   }
   ```

3. **Relationship Extraction**:
   ```typescript
   // Entity relationships
   {
     id: "rel_789",
     type: "relationship",
     sourceId: "ent_alice",
     targetId: "ent_google",
     content: {
       type: "WORKS_FOR",
       description: "Alice works on a new project at Google",
       confidence: 0.85
     },
     metadata: {
       source: "ep_1234",
       validFrom: "2024-02-05T12:00:00Z"
     }
   }
   ```

### Layer 3: Community Graph

Entities are clustered into communities based on their relationships and semantic similarity:

```typescript
// Community node
{
  id: "com_456",
  type: "community",
  content: {
    name: "Tech Companies",
    description: "Technology companies and their employees"
  },
  metadata: {
    members: ["ent_google", "ent_alice", "ent_bob"],
    memberCount: 3,
    lastUpdateTime: "2024-02-05T12:00:00Z",
    confidence: 0.82
  }
}
```

## Search and Retrieval

The framework uses hybrid search to combine results from all layers:

```typescript
// Example search query
const query = {
  text: "What projects is Alice working on?",
  timeRange: {
    start: "2024-01-01T00:00:00Z",
    end: "2024-02-05T23:59:59Z"
  }
};

// Hybrid search process
1. Episodic Search (weight: 1.0)
   - Find messages mentioning projects and Alice
   - Score based on text similarity and temporal relevance

2. Entity Search (weight: 0.8)
   - Find entities and relationships connected to "Alice"
   - Score based on relationship types and confidence

3. Community Search (weight: 0.6)
   - Find communities containing Alice
   - Score based on community relevance

// Example search result
{
  nodes: [
    {
      node: episodeNode,
      score: 0.92,
      layer: "episode"
    },
    {
      node: entityNode,
      score: 0.85,
      layer: "entity"
    },
    {
      node: communityNode,
      score: 0.75,
      layer: "community"
    }
  ],
  edges: [
    {
      edge: relationshipEdge,
      score: 0.88
    }
  ]
}
```

## Usage Example

```typescript
// 1. Initialize GraphManager
const graphManager = new GraphManager(config);

// 2. Add message
await graphManager.addNode({
  type: 'episode',
  content: {
    body: "Alice told Bob about her new project at Google",
    timestamp: new Date()
  },
  metadata: new Map([
    ['role', 'user'],
    ['turnId', 'turn_123']
  ])
});

// 3. Search across layers
const results = await graphManager.search({
  query: "Alice's projects",
  timeRange: {
    start: new Date('2024-01-01'),
    end: new Date()
  }
});
```

## Implementation Notes

1. **Temporal Consistency**:
   - All nodes maintain temporal metadata
   - Relationships track validity periods
   - Search respects temporal constraints

2. **Deduplication Strategy**:
   - Entity resolution uses both exact and fuzzy matching
   - Maintains reference to original mentions
   - Preserves temporal context

3. **Search Optimization**:
   - Uses embedding similarity for semantic matching
   - Combines BM25 for text matching
   - Weights results by layer relevance

4. **Community Detection**:
   - Periodic community refinement
   - Dynamic cluster updates
   - Confidence scoring for membership
