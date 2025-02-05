# Graph Framework Architecture

## 1. Core Architecture

### 1.1 Three-Layer Design
The framework follows a hierarchical three-layer architecture:

#### a) Episode Layer (Ge)
- **Purpose**: Non-lossy storage of raw input data
- **Node Structure**:
  ```typescript
  interface EpisodeContent {
    body: string;
    source: string;
    sourceDescription: string;
    timestamp: Date;
  }
  ```
- **Key Features**:
  - Preserves complete conversation history
  - Links to semantic entities
  - Maintains temporal order

#### b) Semantic Entity Layer (Gs)
- **Purpose**: Entity and relationship representation
- **Node Structure**:
  ```typescript
  interface IGraphNode<T> {
    id: string;
    type: string;
    content: T;
    embedding?: Float32Array;
    metadata: Map<string, any>;
    createdAt: Date;
    expiredAt?: Date;
    validAt?: Date;
  }
  ```
- **Edge Structure**:
  ```typescript
  interface IGraphEdge<T> {
    sourceId: string;
    targetId: string;
    content: T;
    invalidAt?: Date;
    metadata: Map<string, any>;
  }
  ```

#### c) Community Layer
- **Purpose**: Higher-level knowledge organization
- **Features**:
  - Dynamic community detection
  - Label propagation algorithm
  - Hierarchical summarization
  - Keyword-based community naming

### 1.2 Bi-Temporal Model
The framework implements a comprehensive bi-temporal model:

#### Transaction Time
- **createdAt**: When fact was added to system
- **expiredAt**: When fact was removed/replaced

#### Valid Time
- **validAt**: Point-in-time when fact became true
- **invalidAt**: Point-in-time when fact ceased to be true

#### Usage Example:
```typescript
// Entity valid from Jan 1 to Mar 1
{
  validAt: "2024-01-01T00:00:00Z",
  invalidAt: "2024-03-01T00:00:00Z",
  // Added to system on Feb 1
  createdAt: "2024-02-01T00:00:00Z"
}
```

## 2. Search Architecture (f = χ(ρ(φ(α))))

### 2.1 Search Phase (φ)
Three parallel search strategies:

#### a) Cosine Similarity (φcos)
- Uses embeddings for semantic search
- 1024-dimensional BGE embeddings
- Configurable similarity thresholds

#### b) BM25 Text Search (φbm25)
- Full-text search on:
  - Entity names and summaries
  - Fact descriptions
  - Community keywords

#### c) Graph Traversal (φbfs)
- Breadth-first search from relevant nodes
- Configurable depth and edge types
- Temporal validity filtering

### 2.2 Reranking Phase (ρ)

#### a) Reciprocal Rank Fusion (RRF)
```typescript
score = Σ(1 / (k + ranki))
// where k is a constant (typically 60)
```

#### b) Maximal Marginal Relevance (MMR)
```typescript
MMR = λ * sim(Di, Q) - (1-λ) * max(sim(Di, Dj))
// where λ balances relevance and diversity
```

#### c) Custom Rerankers
- Episode-mentions reranker
  * Boosts frequently referenced entities
  * Temporal decay factor
- Node distance reranker
  * Prioritizes closely connected nodes
  * Path length penalties

### 2.3 Construction Phase (χ)
Formats search results into structured context:

```typescript
interface SearchContext {
  facts: Array<{
    content: string;
    validFrom: Date;
    validTo: Date;
    confidence: number;
  }>;
  entities: Array<{
    name: string;
    summary: string;
    type: string;
  }>;
  communities: Array<{
    name: string;
    summary: string;
    memberCount: number;
  }>;
}
```

### 2.4 Synthesized Search Results

The search pipeline produces a carefully structured context that can be directly used by LLM agents. The context follows a specific format designed to help the LLM understand temporal relationships, entity connections, and community context.

#### Example Query
```typescript
const results = await graphManager.search({
  query: "What camera and lenses have I used for bird photography?",
  timeRange: {
    start: new Date("2024-01-01"),
    end: new Date("2024-03-15")
  }
});
```

#### Synthesized Context
```typescript
const context = `CONTEXT
The following information is extracted from your memory about cameras and lenses used for bird photography:

TEMPORAL FACTS
These facts are listed with their validity periods:
[2024-01-01 - 2024-03-01] Used Canon EOS R6 Mark II with RF 100-400mm f/5.6-8 lens for bird photography
[2024-01-15 - 2024-03-01] Added RF 1.4x Teleconverter to extend reach to 560mm
[2024-03-01 - Present] Upgraded to RF 100-500mm f/4.5-7.1L for better reach and image quality

ENTITY DETAILS
1. Canon EOS R6 Mark II (Camera)
   - Advanced mirrorless camera with Animal Eye AF
   - Used continuously since January 2024
   - Primary features: 40 FPS, Dual Pixel AF II

2. RF 100-400mm f/5.6-8 (Lens)
   - Entry-level telephoto zoom
   - Used: Jan 2024 - Mar 2024
   - Notable for: Lightweight, good reach

3. RF 100-500mm f/4.5-7.1L (Lens)
   - Professional L-series telephoto
   - Used: Mar 2024 - Present
   - Notable for: Superior optics, weather sealing

COMMUNITY INSIGHTS
From the Wildlife Photography Equipment community:
- This camera-lens combination is popular for bird photography
- The R6 II's Animal Eye AF works particularly well with both lenses
- The 100-500L is preferred by serious bird photographers for its extra reach

RELATED EPISODES
Recent relevant conversations:
[2024-01-01] Initial camera purchase discussion
[2024-01-15] Teleconverter addition for more reach
[2024-03-01] Lens upgrade discussion and comparison

CONFIDENCE SCORES
- Camera information: 0.95
- Lens timeline: 0.92
- Usage patterns: 0.88
- Community insights: 0.85
`;

#### Key Features of Synthesized Context

1. **Structured Sections**
   - TEMPORAL FACTS: Time-bound information
   - ENTITY DETAILS: Core entity information
   - COMMUNITY INSIGHTS: Related community knowledge
   - RELATED EPISODES: Relevant conversations
   - CONFIDENCE SCORES: Reliability metrics

2. **Temporal Clarity**
   - Clear date ranges for each fact
   - "Present" used for current facts
   - Chronological ordering within sections

3. **Entity Relationships**
   - Equipment combinations
   - Usage patterns
   - Feature relationships

4. **Community Context**
   - Broader usage patterns
   - Expert insights
   - Common configurations

5. **Confidence Indication**
   - Explicit confidence scores
   - Source reliability
   - Information freshness

This structured format helps LLM agents:
- Understand temporal relationships
- Track equipment evolution
- Consider community knowledge
- Assess information reliability
- Generate accurate responses

### 2.5 Result Synthesis Approaches

The industry has developed several approaches for synthesizing search results into LLM context:

#### 1. Direct Structured Format
```typescript
// No LLM summarization needed
const context = {
  facts: retrievedFacts.map(f => ({
    content: f.content,
    validFrom: f.validAt,
    validTo: f.invalidAt || 'Present'
  })),
  entities: retrievedEntities.map(e => ({
    name: e.name,
    type: e.type,
    summary: e.summary
  })),
  communities: retrievedCommunities.map(c => ({
    name: c.name,
    summary: c.summary
  }))
};
```

**Advantages**:
- Low latency (no LLM call)
- Deterministic output
- Clear structure for LLM parsing
- Preserves original information fidelity

#### 2. Two-Stage Synthesis
```typescript
// Stage 1: Structured retrieval
const rawContext = await graphManager.search(query);

// Stage 2: LLM summarization
const synthesizedContext = await llm.complete({
  prompt: `Synthesize the following information into a coherent context:
          ${JSON.stringify(rawContext)}`,
  temperature: 0.3  // Low temperature for consistency
});
```

**Advantages**:
- More natural language flow
- Connects related information
- Highlights key insights
- Better for complex relationships

#### 3. Hybrid Approach (Recommended)
```typescript
const context = `CONTEXT
# Retrieved Facts (Direct)
${formatFacts(retrievedFacts)}

# Entity Information (Direct)
${formatEntities(retrievedEntities)}

# Synthesized Insights (LLM-generated)
${await synthesizeInsights(retrievedFacts, retrievedEntities)}

# Confidence Scores (Direct)
${formatConfidenceScores(scores)}`;
```

**Advantages**:
- Balances structure and synthesis
- Preserves raw facts while adding insights
- Flexible for different query types
- Optimizes LLM token usage

#### Best Practices

1. **Format Selection**:
   - Use direct structured format for factual queries
   - Use two-stage synthesis for relationship-heavy queries
   - Use hybrid approach for complex temporal queries

2. **Performance Optimization**:
   - Cache synthesized results
   - Use streaming for long contexts
   - Batch similar queries

3. **Quality Control**:
   - Preserve original timestamps
   - Include confidence scores
   - Maintain source references

4. **LLM Considerations**:
   - Use consistent formatting
   - Include explicit section markers
   - Provide temporal context
   - Include confidence indicators

The choice of synthesis approach should be based on:
- Query complexity
- Performance requirements
- Information type
- LLM token budget
- Accuracy requirements

### 2.6 Synthesis Approach Examples

#### 1. Direct Structured Format Examples

**Best For**:
- Simple fact retrieval
- Timeline queries
- Entity property lookups
- High-volume queries
- Performance-critical applications

**Example Queries**:
```typescript
// 1. Simple fact retrieval
"What camera am I currently using?"
"When did I buy the RF 100-500mm lens?"

// 2. Timeline query
"List all my camera equipment purchases in 2024"

// 3. Entity property lookup
"What is the maximum aperture of my RF 100-400mm?"

// Response Format:
const context = {
  currentEquipment: {
    camera: "Canon EOS R6 Mark II",
    since: "2024-01-01"
  },
  purchases: [
    {
      item: "RF 100-400mm",
      date: "2024-01-01",
      properties: {
        aperture: "f/5.6-8"
      }
    }
  ]
};
```

#### 2. Two-Stage Synthesis Examples

**Best For**:
- Complex relationships
- Pattern analysis
- Behavioral insights
- Trend identification
- Cross-episode analysis

**Example Queries**:
```typescript
// 1. Usage pattern analysis
"How has my bird photography technique evolved?"

// 2. Equipment effectiveness
"Which lens performs better for bird photography?"

// 3. Learning progression
"How has my understanding of camera settings improved?"

// Stage 1: Structured Data
const rawData = {
  episodes: [
    { date: "2024-01-01", settings: "f/8, 1/1000s" },
    { date: "2024-03-01", settings: "f/7.1, 1/2000s" }
  ],
  equipment: [...],
  results: [...]
};

// Stage 2: LLM Synthesis
const synthesis = `Your bird photography has evolved significantly:
1. Initially used basic settings (f/8, 1/1000s)
2. Gradually adopted faster shutter speeds
3. Showed improved understanding of light conditions
4. Successfully captured more birds in flight`;
```

#### 3. Hybrid Approach Examples

**Best For**:
- Complex temporal queries
- Multi-entity relationships
- Community insights
- Mixed factual/analytical queries
- Decision support

**Example Queries**:
```typescript
// 1. Equipment recommendation
"What lens should I get for bird photography?"

// Response Format:
const context = `CONTEXT

# Direct Facts
- Currently own: R6 Mark II, RF 100-400mm
- Budget range: $2000-3000
- Main use: Bird photography
- Shooting style: Handheld

# Equipment Options (Direct)
1. RF 100-500mm f/4.5-7.1L
   - Price: $2,899
   - Weight: 1,365g
2. RF 100-400mm + 1.4x TC
   - Price: $1,799
   - Weight: 1,200g

# Community Insights (LLM-Synthesized)
Based on your shooting style and experience:
- The 100-500L would be ideal given your growing expertise
- Its extra reach and better optics align with your progression
- The weight is manageable for your handheld technique
- Community feedback shows high satisfaction for bird photography

# Confidence Scores (Direct)
- Equipment data: 0.95
- Usage analysis: 0.88
- Community insights: 0.85`;

// 2. Learning progression analysis
"How should I improve my wildlife photography?"

// Response Format:
const context = `CONTEXT

# Technical Facts (Direct)
- Current settings used:
  * ISO: Auto (100-6400)
  * AF: Animal Eye AF
  * Drive: H+ (40 fps)

# Recent Results (Direct)
- Sharp images: 75%
- Keeper rate: 60%
- Common issues:
  * Motion blur: 15%
  * Missed focus: 10%

# Learning Path (LLM-Synthesized)
Based on your progress and community patterns:
1. Focus on anticipating bird behavior
2. Practice panning techniques
3. Experiment with back-button focus
4. Master exposure compensation

# Community Benchmarks (Direct)
- Average keeper rate: 50%
- Typical progression time: 6 months
- Common milestone sequence:
  1. Basic flight shots
  2. Behavior captures
  3. Artistic compositions`;
```

Each approach has its strengths, and the choice depends on:
1. Query complexity
2. Response time requirements
3. Token budget
4. Accuracy needs
5. User experience goals

## 3. Processing Pipeline

### 3.1 Batch Processing
- Processes every 4 turns
- Steps:
  1. Episode creation
  2. Entity extraction
  3. Relationship detection
  4. Community updates

### 3.2 Entity Resolution
- Embedding similarity check
- Full-text name matching
- LLM-based resolution for ambiguous cases
- Deduplication with summary merging

### 3.3 Community Management
- Label propagation for initial formation
- Dynamic updates for new nodes
- Periodic full refresh
- Hierarchical summarization

## 4. Configuration Options

### 4.1 Search Configuration
```typescript
interface SearchConfig {
  textWeight: number;      // BM25 weight
  embeddingWeight: number; // Cosine similarity weight
  minTextScore: number;    // BM25 threshold
  minEmbeddingScore: number; // Similarity threshold
  limit: number;           // Result limit
}
```

### 4.2 Temporal Configuration
```typescript
interface TemporalConfig {
  validateTimestamp: boolean;
  autoSetValidAt: boolean;
  defaultTimeWindow?: {
    start: Date;
    end: Date;
  };
}
```

### 4.3 Community Configuration
```typescript
interface CommunityConfig {
  refreshInterval: number;  // Turns between full refresh
  minCommunitySize: number;
  maxCommunitySize: number;
  labelPropagationIterations: number;
}
```

## 5. Usage Examples

### 5.1 Basic Search
```typescript
const results = await graphManager.search({
  query: "camera recommendations",
  timeRange: {
    start: new Date("2024-01-01"),
    end: new Date("2024-02-01")
  }
});
```

### 5.2 Entity Creation
```typescript
const entity = await graphManager.addNode({
  type: "CAMERA",
  name: "Canon EOS R6 Mark II",
  content: {
    manufacturer: "Canon",
    category: "Mirrorless",
    features: ["Animal AF", "IBIS"]
  },
  validAt: new Date()
});
```

### 5.3 Relationship Creation
```typescript
const edge = await graphManager.addEdge({
  sourceId: "ent_r6m2",
  targetId: "ent_animal_af",
  type: "HAS_FEATURE",
  content: {
    description: "Advanced animal eye detection"
  }
});
