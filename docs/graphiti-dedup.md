# Graphiti Deduplication Process Analysis

This document analyzes how graphiti implements its entity deduplication process, which can inform our implementation.

## Overview

### 1. Entity Extraction
- The `extract_nodes()` function in `node_operations.py` handles extracting entities from episodes
- It uses different extraction methods based on episode type (message, text, or JSON)
- Implements a reflexion mechanism to catch missed entities through multiple iterations
- Creates EntityNode objects for each extracted entity with basic metadata

### 2. Deduplication Process
- The `dedupe_extracted_nodes()` function handles deduplication of newly extracted entities against existing ones
- For each batch of extracted nodes, it:
  1. Builds a map of existing nodes by UUID
  2. Prepares context with both existing and extracted node information
  3. Uses LLM to identify duplicates through the deduplication prompt
  4. Creates a UUID mapping for duplicate entities

### 3. Deduplication Prompt
- The prompt in `dedupe_nodes.py` guides the LLM to:
  1. Compare new nodes against existing ones using both name and summary
  2. Determine if entities are duplicates
  3. Return the UUID of the existing node if a duplicate is found
  4. Suggest the most complete name for the entity
  
### 4. Bulk Deduplication
- The `dedupe_node_list()` function handles bulk deduplication
- Groups duplicate nodes together by UUID
- Synthesizes summaries for duplicate groups
- Returns a mapping of duplicate UUIDs

## Implementation Insights

### 1. Two-Level Deduplication
```typescript
// First level: Single node deduplication
async function deduplicateEntity(newEntity: Entity, existingEntities: Entity[]) {
  const context = {
    newEntity,
    existingEntities,
    // Include temporal context
    timestamp: new Date()
  };
  
  const result = await llmClient.deduplicate(context);
  return result.isDuplicate ? result.duplicateId : null;
}

// Second level: Bulk deduplication
async function bulkDeduplicate(entities: Entity[]) {
  const groups = await llmClient.groupDuplicates(entities);
  return groups.map(group => ({
    primaryId: group.primary,
    duplicates: group.others,
    mergedMetadata: mergeDuplicateMetadata(group.entities)
  }));
}
```

### 2. Temporal Context
```typescript
interface DuplicationContext {
  // Track when entities were first mentioned
  firstMentionedAt: Date;
  // Track relationships over time
  temporalRelationships: {
    entityId: string;
    relationship: string;
    timestamp: Date;
  }[];
}
```

### 3. Relationship Preservation
```typescript
async function mergeEntities(primary: Entity, duplicate: Entity) {
  // Preserve relationships from both entities
  const mergedRelationships = new Set([
    ...primary.relationships,
    ...duplicate.relationships
  ]);
  
  // Update references in other entities
  await updateEntityReferences(duplicate.id, primary.id);
  
  return {
    ...primary,
    relationships: Array.from(mergedRelationships),
    metadata: mergeDuplicateMetadata([primary, duplicate])
  };
}
```

### 4. Confidence Scoring
```typescript
interface DeduplicationResult {
  isDuplicate: boolean;
  confidence: number; // 0-1 score
  reasoning: string;
  suggestedAction: 'merge' | 'keep_separate' | 'needs_review';
}
```

### 5. Validation Rules
```typescript
const validationRules = {
  // Minimum confidence threshold for automatic merging
  minConfidence: 0.85,
  
  // Required matching fields
  requiredMatches: ['name', 'type'],
  
  // Fields that must not conflict
  nonConflictingFields: ['birthDate', 'uniqueIdentifiers'],
  
  // Time window for considering temporal context
  temporalWindow: 30 * 24 * 60 * 60 * 1000 // 30 days
};
```

### 6. Prompt Engineering
```typescript
const deduplicationPrompt = `
Given the following entities:
- New Entity: {newEntity}
- Existing Entities: {existingEntities}

Consider:
1. Name variations and aliases
2. Temporal context and relationships
3. Attribute consistency
4. Confidence level

Determine if the new entity is a duplicate of any existing entity.
Provide:
1. isDuplicate (boolean)
2. duplicateId (string or null)
3. confidence (0-1)
4. reasoning (string)
`;
```

## Key Takeaways

The insights from graphiti's implementation can help us create a robust deduplication system that:
1. Handles both single-node and bulk deduplication efficiently
2. Preserves temporal context and relationships
3. Uses confidence scoring for merge decisions
4. Implements validation rules to prevent incorrect merges
5. Maintains detailed metadata about the deduplication process
