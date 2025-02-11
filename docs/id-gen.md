# Unique ID Generation Strategy for Graph-Based Memory Systems  

## 1. Overview  
This document outlines a robust hybrid strategy for generating unique identifiers (IDs) in graph-based systems, ensuring consistency, deduplication, and adaptability across storage backends. The approach combines deterministic hashing (SHA-256) and universally unique identifiers (UUIDs) to balance content-based identification with guaranteed uniqueness.  

---

## 2. Core ID Generation Strategy  

### 2.1 Rules for ID Creation  
1. **Primary ID Generation**:  
   - Generate a SHA-256 hash from the **normalized content** of the node/edge.  
   - **Normalization steps**: Lowercasing, punctuation removal, stemming, and synonym resolution (e.g., mapping "Eric Blair" → "George Orwell").  
   - If the hash is unique (not in `generatedIds`), use it as the ID.  

2. **Fallback Mechanism**:  
   - If the SHA-256 hash collides (exists in `generatedIds`), generate a UUID as the ID.  

### 2.2 Metadata Handling  
- **Embedding Vectors**: Stored as metadata for semantic similarity comparisons (e.g., cosine similarity).  
- **SHA-256 Hashes**: Not stored in metadata; used transiently during ID generation.  

### 2.3 Reasoning  
- **Deterministic Uniqueness**: SHA-256 ensures identical content produces the same ID, enabling deduplication.  
- **UUID Fallback**: Guarantees uniqueness for edge cases (hash collisions).  
- **Embeddings for Semantics**: Facilitate fuzzy matching beyond exact content comparisons.  

---

## 3. Implementation Components  

### 3.1 Core Architecture  
- **`IdGenerator` Interface**: Defines methods for node/edge ID generation.  
- **`DeterministicIdGenerator` Class**: Implements the hybrid SHA-256/UUID strategy.  
- **`InMemoryGraphStorage`**: Integrates the `IdGenerator` to manage node/edge creation.  

### 3.2 Key Features  
- **Modular Design**:  
  - Storage layers (e.g., `EpisodicMemoryStorage`, `SemanticMemoryStorage`) inject the `IdGenerator`.  
  - Clean separation between graph operations (e.g., `MemoryGraph`) and storage logic.  
- **Type Safety**: Enforced through strict type checks for nodes/edges and optional properties.  

---

## 4. Integration with Storage Systems  

### 4.1 General Workflow for Storage Adapters  
1. **Create a Storage-Specific `IdGenerator`**:  
   - Examples: `Neo4jIdGenerator`, `AgeIdGenerator`.  
   - Adapts to the storage’s native ID system (e.g., internal IDs vs. content-based hashes).  

2. **Implement Storage-Specific `GraphStorage`**:  
   - Examples: `Neo4jGraphStorage`, `AgeGraphStorage`.  
   - Uses the `IdGenerator` to create nodes/edges and handle deduplication.  

3. **Inject Dependencies**:  
   - Configure `GraphManager` to initialize the correct `IdGenerator` and `GraphStorage` based on the backend.  

### 4.2 Example: Neo4j Integration  
- **Option 1**: Use Neo4j’s internal ID as the primary key; store SHA-256 hashes as a `contentHash` property for deduplication.  
- **Option 2**: Precompute IDs (SHA-256/UUID) externally and enforce uniqueness within Neo4j.  

```typescript  
class Neo4jIdGenerator implements IdGenerator {  
  generateNodeId(nodeType: string, content: string): string {  
    const normalized = normalize(content);  
    return sha256(normalized) || uuidv4();  
  }  
}  

class Neo4jGraphStorage implements IGraphStorage {  
  constructor(private idGenerator: Neo4jIdGenerator) {}  
  async addNode(node: IGraphNode): Promise<string> {  
    const id = this.idGenerator.generateNodeId(node.type, node.content);  
    // Store node in Neo4j with id and metadata  
    return id;  
  }  
}  
```  

---

## 5. Deduplication and Entity Resolution  

### 5.1 Hybrid Deduplication Workflow  
1. **Entity Extraction**:  
   - Extract entities using an LLM; generate embeddings for semantic analysis.  

2. **Normalization & Hashing**:  
   - Normalize entity content (e.g., "eric blair" → "george orwell").  
   - Compute SHA-256 hash of normalized content.  

3. **ID Assignment**:  
   - **Exact Match**: Use existing ID if hash exists in `generatedIds`.  
   - **No Match**:  
     - Generate UUID and add to `generatedIds`.  
     - Compare embeddings against existing nodes for semantic similarity.  
     - Merge entities if similarity exceeds a threshold (e.g., cosine similarity > 0.9).  

### 5.2 Reducing LLM Calls  
- **SHA-256**: Eliminates LLM calls for exact duplicates post-normalization.  
- **Embeddings**: Reduces LLM dependency for fuzzy matching (vs. OpenAI’s `DEDUPE_NODES`).  

---

## 6. Comparison with Alternative Approaches  

### 6.1 OpenAI’s Proposal  
- **UUIDs as Primary Keys**: Prioritizes global uniqueness; stores SHA-256 hashes as properties.  
- **Strengths**: Stable entity tracking across systems.  
- **Weaknesses**: Increased storage overhead (UUID + hash per entity).  

### 6.2 Content-Based Strategy (This Document)  
- **SHA-256 as Primary Key**: Prioritizes deduplication and consistency.  
- **Strengths**: Reduced storage, efficient exact-match resolution.  
- **Weaknesses**: Mixed ID types (SHA-256/UUID) add code complexity.  

---

## 7. Conclusion  
This strategy balances deterministic content-based identification with fallback uniqueness, optimized for graph-based memory systems requiring deduplication and semantic resolution. By decoupling ID generation from storage backends and leveraging embeddings, it ensures adaptability across databases (Neo4j, Apache AGE) while minimizing LLM dependency.  

**Key Takeaways**:  
- Use SHA-256 for exact matches, UUIDs for collisions.  
- Store embeddings for semantic comparisons, not hashes.  
- Design modular `IdGenerator` and `GraphStorage` for backend flexibility.