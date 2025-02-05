# Graph Processing Framework: A Complete Example

This document walks through a complete example of how our graph processing framework handles a 20-turn conversation about camera setup and photography.

## Sample Conversation

```typescript
// 20-turn conversation about camera setup
[Turn 1  - User]     Just got my new Canon EOS R6 Mark II!
[Turn 2  - Assistant] Congratulations! The R6 Mark II is an excellent camera. Would you like help setting it up?
[Turn 3  - User]     Yes please. First, how do I set up the autofocus?
[Turn 4  - Assistant] The R6 Mark II has several AF modes. For moving subjects, I recommend Servo AF.

[Turn 5  - User]     I want to photograph birds. Will that work?
[Turn 6  - Assistant] Yes! Enable Animal Detection in the AF menu. It's great for birds.
[Turn 7  - User]     The tracking seems very responsive
[Turn 8  - Assistant] The R6 Mark II's Dual Pixel AF II system is known for fast tracking.

[Turn 9  - User]     What about the RF 100-500mm lens for birds?
[Turn 10 - Assistant] The RF 100-500mm is perfect for bird photography. Great reach and sharp.
[Turn 11 - User]     But it's quite expensive
[Turn 12 - Assistant] Yes, the RF 100-500mm is premium. The RF 100-400mm is a cheaper alternative.

[Turn 13 - User]     I'll stick with my RF 70-200mm f/2.8 for now
[Turn 14 - Assistant] That's still an excellent lens! Very versatile and great image quality.
[Turn 15 - User]     Should I use high-speed continuous shooting?
[Turn 16 - Assistant] Yes, set it to H+ (high-speed+) for 12 fps with mechanical shutter.

[Turn 17 - User]     What memory card should I use?
[Turn 18 - Assistant] For high-speed shooting, use UHS-II SD cards, at least 300MB/s.
[Turn 19 - User]     And what about battery life?
[Turn 20 - Assistant] The LP-E6NH battery gives about 1000 shots per charge in normal use.
```

## Batch Processing

### Batch 1 (Turns 1-4)

#### Episodic Layer
```typescript
[
  {
    id: "ep_1",
    type: "episode",
    content: {
      body: "Just got my new Canon EOS R6 Mark II!",
      timestamp: "2025-02-05T15:00:00Z"
    },
    metadata: {
      role: "user",
      turnId: "turn_1"
    }
  },
  // ... episodes for turns 2-4
]
```

#### Entity Layer
```typescript
{
  "entities": [
    {
      "id": "ent_r6m2",
      "name": "Canon EOS R6 Mark II",
      "category": "CAMERA_MODEL",
      "summary": "Main camera being discussed, newly purchased"
    },
    {
      "id": "ent_servo_af",
      "name": "Servo AF",
      "category": "CAMERA_FEATURE",
      "summary": "Autofocus mode for moving subjects"
    }
  ],
  "relationships": [
    {
      "source": "ent_servo_af",
      "target": "ent_r6m2",
      "type": "FEATURE_OF",
      "description": "Servo AF is a recommended autofocus mode for the R6 Mark II",
      "confidence": 0.95
    }
  ]
}
```

### Batch 2 (Turns 5-8)

#### Entity Layer (New/Updated)
```typescript
{
  "entities": [
    {
      "id": "ent_animal_detect",
      "name": "Animal Detection",
      "category": "CAMERA_FEATURE",
      "summary": "AI-powered animal tracking feature"
    },
    {
      "id": "ent_dpaf2",
      "name": "Dual Pixel AF II",
      "category": "TECHNOLOGY",
      "summary": "Advanced autofocus system used in the R6 Mark II"
    }
  ],
  "relationships": [
    {
      "source": "ent_animal_detect",
      "target": "ent_r6m2",
      "type": "FEATURE_OF",
      "description": "Animal Detection is recommended for bird photography",
      "confidence": 0.9
    },
    {
      "source": "ent_dpaf2",
      "target": "ent_r6m2",
      "type": "TECHNOLOGY_IN",
      "description": "R6 Mark II uses Dual Pixel AF II for tracking",
      "confidence": 0.95
    }
  ]
}
```

### Batch 3 (Turns 9-12)

#### Entity Layer (New/Updated)
```typescript
{
  "entities": [
    {
      "id": "ent_rf100500",
      "name": "RF 100-500mm",
      "category": "LENS",
      "summary": "Premium telephoto zoom lens"
    },
    {
      "id": "ent_rf100400",
      "name": "RF 100-400mm",
      "category": "LENS",
      "summary": "More affordable telephoto zoom lens"
    }
  ],
  "relationships": [
    {
      "source": "ent_rf100500",
      "target": "ent_bird_photo",
      "type": "SUITABLE_FOR",
      "description": "RF 100-500mm is recommended for bird photography",
      "confidence": 0.9
    },
    {
      "source": "ent_rf100400",
      "target": "ent_rf100500",
      "type": "ALTERNATIVE_TO",
      "description": "RF 100-400mm is a cheaper alternative to RF 100-500mm",
      "confidence": 0.95
    }
  ]
}
```

### Batch 4 (Turns 13-16)

#### Entity Layer (New/Updated)
```typescript
{
  "entities": [
    {
      "id": "ent_rf70200",
      "name": "RF 70-200mm f/2.8",
      "category": "LENS",
      "summary": "Versatile professional zoom lens"
    },
    {
      "id": "ent_highspeed",
      "name": "High-Speed+ Shooting",
      "category": "CAMERA_FEATURE",
      "summary": "12 fps continuous shooting with mechanical shutter"
    }
  ],
  "relationships": [
    {
      "source": "ent_rf70200",
      "target": "ent_r6m2",
      "type": "COMPATIBLE_WITH",
      "description": "RF 70-200mm f/2.8 is compatible with R6 Mark II",
      "confidence": 0.95
    }
  ]
}
```

### Batch 5 (Turns 17-20)

#### Entity Layer (New/Updated)
```typescript
{
  "entities": [
    {
      "id": "ent_uhs2",
      "name": "UHS-II SD Card",
      "category": "ACCESSORY",
      "summary": "High-speed memory card, 300MB/s+"
    },
    {
      "id": "ent_lpe6nh",
      "name": "LP-E6NH Battery",
      "category": "ACCESSORY",
      "summary": "Camera battery with 1000-shot capacity"
    }
  ],
  "relationships": [
    {
      "source": "ent_uhs2",
      "target": "ent_highspeed",
      "type": "REQUIRED_FOR",
      "description": "UHS-II cards needed for high-speed shooting",
      "confidence": 0.9
    }
  ]
}
```

### Community Layer (After All Batches)

```typescript
{
  "communities": [
    {
      "id": "com_camera_system",
      "name": "R6 Mark II System",
      "members": ["ent_r6m2", "ent_rf70200", "ent_uhs2", "ent_lpe6nh"],
      "confidence": 0.9
    },
    {
      "id": "com_af_features",
      "name": "Autofocus Features",
      "members": ["ent_servo_af", "ent_animal_detect", "ent_dpaf2"],
      "confidence": 0.85
    },
    {
      "id": "com_telephoto",
      "name": "Telephoto Lenses",
      "members": ["ent_rf100500", "ent_rf100400", "ent_rf70200"],
      "confidence": 0.8
    }
  ]
}
```

## Example Search

Query: "What lenses are recommended for bird photography?"

```typescript
// Search across layers
const results = await graphManager.search({
  query: "lenses for bird photography",
  timeRange: {
    start: new Date("2025-02-05T15:00:00Z"),
    end: new Date("2025-02-05T15:30:00Z")
  }
});

// Results will include:
1. Episodic Matches (weight: 1.0):
   - Turn 9-10 about RF 100-500mm
   - Turn 11-12 about RF 100-400mm alternative

2. Entity Matches (weight: 0.8):
   - RF 100-500mm entity and its SUITABLE_FOR relationship
   - RF 100-400mm as an alternative
   - RF 70-200mm as current lens

3. Community Matches (weight: 0.6):
   - "Telephoto Lenses" community

// Final synthesized response:
"The RF 100-500mm lens is highly recommended for bird photography, offering great reach and sharpness. 
 The RF 100-400mm is a more affordable alternative. 
 While the RF 70-200mm f/2.8 can be used, it has shorter reach than the other options."
```

This example demonstrates how:
1. Each batch builds up the graph incrementally
2. Entities are extracted and relationships formed
3. Communities emerge from related entities
4. Search synthesizes information across all layers
