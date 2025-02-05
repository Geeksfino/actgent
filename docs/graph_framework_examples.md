# Graph Framework Example Scenarios

## Scenario 1: Camera Purchase Consultation
This scenario demonstrates entity evolution, relationship building, and community formation.

### 1.1 Initial Conversation
```typescript
// Turn 1: User introduces their need
Episode {
  id: "ep_1",
  content: {
    body: "I need a camera for wildlife photography, especially birds.",
    timestamp: "2024-01-01T10:00:00Z"
  }
}

// System extracts initial entities
Entity {
  id: "ent_wildlife_photo",
  type: "PHOTOGRAPHY_TYPE",
  name: "Wildlife Photography",
  summary: "Photography of wild animals in their natural habitat"
}

Entity {
  id: "ent_bird_photo",
  type: "PHOTOGRAPHY_TYPE",
  name: "Bird Photography",
  summary: "Specialized form of wildlife photography focusing on birds"
}

// Creates relationships
Edge {
  sourceId: "ent_bird_photo",
  targetId: "ent_wildlife_photo",
  type: "SPECIALIZATION_OF"
}
```

### 1.2 Camera Recommendation
```typescript
// Turn 2: System recommends R6 Mark II
Entity {
  id: "ent_r6m2",
  type: "CAMERA",
  name: "Canon EOS R6 Mark II",
  content: {
    manufacturer: "Canon",
    type: "Mirrorless",
    features: ["Animal Eye AF", "High FPS"]
  },
  validAt: "2024-01-01T10:02:00Z"
}

// Turn 3: System explains features
Entity {
  id: "ent_animal_af",
  type: "CAMERA_FEATURE",
  name: "Animal Eye AF",
  summary: "AI-powered autofocus that detects and tracks animal eyes"
}

Edge {
  sourceId: "ent_r6m2",
  targetId: "ent_animal_af",
  type: "HAS_FEATURE",
  validAt: "2024-01-01T10:03:00Z"
}
```

### 1.3 Community Formation
```typescript
// After 4 turns, forms communities
Community {
  id: "com_wildlife_gear",
  name: "Wildlife Photography Equipment",
  members: ["ent_r6m2", "ent_animal_af", "ent_wildlife_photo"],
  summary: "Equipment and features specialized for wildlife photography"
}
```

## Scenario 2: Lens Upgrade Over Time
This scenario shows temporal evolution and fact updates.

### 2.1 Initial Lens Setup
```typescript
// January 1st: User's current lens
Entity {
  id: "ent_100400",
  type: "LENS",
  name: "RF 100-400mm f/5.6-8",
  content: {
    focalLength: "100-400mm",
    maxAperture: "f/5.6-8"
  },
  validAt: "2024-01-01T00:00:00Z"
}

Edge {
  sourceId: "ent_100400",
  targetId: "ent_r6m2",
  type: "COMPATIBLE_WITH",
  validAt: "2024-01-01T00:00:00Z"
}
```

### 2.2 Lens Upgrade
```typescript
// March 1st: User upgrades to 100-500mm
Entity {
  id: "ent_100500",
  type: "LENS",
  name: "RF 100-500mm f/4.5-7.1L",
  content: {
    focalLength: "100-500mm",
    maxAperture: "f/4.5-7.1"
  },
  validAt: "2024-03-01T00:00:00Z"
}

// Old lens relationship becomes invalid
Edge {
  sourceId: "ent_100400",
  targetId: "ent_r6m2",
  type: "USED_WITH",
  validAt: "2024-01-01T00:00:00Z",
  invalidAt: "2024-03-01T00:00:00Z"
}

// New lens relationship becomes valid
Edge {
  sourceId: "ent_100500",
  targetId: "ent_r6m2",
  type: "USED_WITH",
  validAt: "2024-03-01T00:00:00Z"
}
```

## Scenario 3: Complex Search Example
This scenario demonstrates the search pipeline in action.

### 3.1 User Query
```typescript
const query = "What lens was I using for bird photography in February?";
```

### 3.2 Search Phase (φ)
```typescript
// Cosine Similarity Results (φcos)
[
  {node: "ent_100400", score: 0.85},
  {node: "ent_bird_photo", score: 0.82}
]

// BM25 Results (φbm25)
[
  {node: "ent_100400", score: 0.9},
  {node: "ent_wildlife_gear", score: 0.7}
]

// Graph Traversal (φbfs)
[
  {path: ["ent_bird_photo", "ent_100400"], length: 2},
  {path: ["ent_wildlife_gear", "ent_100400"], length: 2}
]
```

### 3.3 Reranking Phase (ρ)
```typescript
// RRF Scores
[
  {node: "ent_100400", score: 0.92},  // High in all methods
  {node: "ent_bird_photo", score: 0.78},
  {node: "ent_wildlife_gear", score: 0.65}
]

// MMR Diversification
[
  {node: "ent_100400", score: 0.92},
  {node: "ent_wildlife_gear", score: 0.65}  // Different perspective
]
```

### 3.4 Construction Phase (χ)
```typescript
const context = {
  facts: [
    {
      content: "RF 100-400mm f/5.6-8 was the primary lens",
      validFrom: "2024-01-01T00:00:00Z",
      validTo: "2024-03-01T00:00:00Z",
      confidence: 0.92
    }
  ],
  entities: [
    {
      name: "RF 100-400mm f/5.6-8",
      summary: "Versatile telephoto zoom lens for wildlife",
      type: "LENS"
    }
  ],
  communities: [
    {
      name: "Wildlife Photography Equipment",
      summary: "Equipment setup for wildlife photography",
      memberCount: 5
    }
  ]
}
```

## Scenario 4: Community Evolution
This scenario shows how communities adapt to new information.

### 4.1 Initial Community
```typescript
// Wildlife Photography Community
Community {
  id: "com_wildlife",
  members: ["ent_r6m2", "ent_100400"],
  summary: "Basic wildlife photography setup"
}
```

### 4.2 Dynamic Update
```typescript
// New accessory added
Entity {
  id: "ent_teleconv",
  type: "ACCESSORY",
  name: "RF 1.4x Teleconverter",
  summary: "Extends focal length by 1.4x"
}

// Community automatically updated
Community {
  id: "com_wildlife",
  members: ["ent_r6m2", "ent_100400", "ent_teleconv"],
  summary: "Extended wildlife photography setup with teleconverter"
}
```

### 4.3 Periodic Refresh
```typescript
// After 20 turns, full community refresh
Community {
  id: "com_wildlife",
  members: [
    "ent_r6m2",
    "ent_100500",  // New lens
    "ent_teleconv",
    "ent_bird_photo",
    "ent_animal_af"
  ],
  summary: "Complete wildlife photography system with advanced features"
}
```

These scenarios demonstrate:
1. Natural entity evolution
2. Temporal relationship tracking
3. Community formation and updates
4. Complex search pipeline
5. Bi-temporal data handling
