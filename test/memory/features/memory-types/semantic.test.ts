import { describe, test, expect, beforeEach } from 'bun:test';
import { LongTermMemory } from '../../../../src/core/memory/LongTermMemory';
import { MockMemoryStorage, MockMemoryIndex } from '../../utils/test-helpers';
import { MemoryType, MemoryFilter } from '../../../../src/core/memory/types';

describe('Semantic Memory Features', () => {
    let storage: MockMemoryStorage;
    let index: MockMemoryIndex;
    let longTermMemory: LongTermMemory;

    beforeEach(() => {
        storage = new MockMemoryStorage();
        index = new MockMemoryIndex();
        longTermMemory = new LongTermMemory(storage, index);
    });

    test('should handle concept hierarchies', async () => {
        // Store parent concept
        const animalConcept = {
            concept: 'animal',
            properties: ['living', 'mobile'],
            relations: new Map<string, string[]>([
                ['isA', ['organism']],
                ['has', ['body', 'metabolism']]
            ])
        };

        await longTermMemory.store(animalConcept, new Map<string, any>([
            ['type', MemoryType.SEMANTIC]
        ]));

        // Store child concept
        const mammalConcept = {
            concept: 'mammal',
            properties: ['warm-blooded', 'milk-producing'],
            relations: new Map<string, string[]>([
                ['isA', ['animal']],
                ['has', ['fur', 'mammary glands']]
            ])
        };

        await longTermMemory.store(mammalConcept, new Map<string, any>([
            ['type', MemoryType.SEMANTIC]
        ]));

        // Retrieve concepts
        const memories = await longTermMemory.retrieve({
            types: [MemoryType.SEMANTIC]
        });

        expect(memories.length).toBe(2);
        const animal = memories.find(m => m.content.concept === 'animal');
        const mammal = memories.find(m => m.content.concept === 'mammal');

        expect(animal).toBeDefined();
        expect(mammal).toBeDefined();
        expect(mammal?.content.relations.get('isA')).toContain('animal');
    });

    test('should support property inheritance', async () => {
        const concepts = [
            {
                concept: 'vehicle',
                properties: ['mobile', 'manufactured'],
                relations: new Map<string, string[]>([
                    ['has', ['parts']],
                    ['can', ['move']]
                ])
            },
            {
                concept: 'car',
                properties: ['wheeled', 'powered'],
                relations: new Map<string, string[]>([
                    ['isA', ['vehicle']],
                    ['has', ['engine', 'wheels']],
                    ['can', ['drive']]
                ])
            },
            {
                concept: 'electric_car',
                properties: ['electric', 'eco-friendly'],
                relations: new Map<string, string[]>([
                    ['isA', ['car']],
                    ['has', ['battery', 'electric motor']],
                    ['inherits', ['vehicle.mobile', 'car.wheeled']]
                ])
            }
        ];

        // Store concepts
        for (const concept of concepts) {
            await longTermMemory.store(concept, new Map<string, any>([
                ['type', MemoryType.SEMANTIC]
            ]));
        }

        // Retrieve and verify inheritance
        const memories = await longTermMemory.retrieve({
            types: [MemoryType.SEMANTIC]
        });

        const electricCar = memories.find(m => m.content.concept === 'electric_car');
        expect(electricCar).toBeDefined();
        expect(electricCar?.content.relations.get('inherits')).toContain('vehicle.mobile');
    });

    test('should handle semantic relationships', async () => {
        const concepts = [
            {
                concept: 'programming',
                relations: new Map<string, string[]>([
                    ['includes', ['coding', 'debugging']],
                    ['requires', ['computer', 'knowledge']],
                    ['produces', ['software']]
                ])
            },
            {
                concept: 'debugging',
                relations: new Map<string, string[]>([
                    ['partOf', ['programming']],
                    ['requires', ['problem-solving']],
                    ['uses', ['tools', 'logs']]
                ])
            }
        ];

        // Store concepts
        for (const concept of concepts) {
            await longTermMemory.store(concept, new Map<string, any>([
                ['type', MemoryType.SEMANTIC]
            ]));
        }

        // Verify bidirectional relationships
        const memories = await longTermMemory.retrieve({
            types: [MemoryType.SEMANTIC]
        });

        const programming = memories.find(m => m.content.concept === 'programming');
        const debugging = memories.find(m => m.content.concept === 'debugging');

        expect(programming?.content.relations.get('includes')).toContain('debugging');
        expect(debugging?.content.relations.get('partOf')).toContain('programming');
    });
});
