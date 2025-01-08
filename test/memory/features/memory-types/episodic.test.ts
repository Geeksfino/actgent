import { describe, test, expect, beforeEach } from 'bun:test';
import { LongTermMemory } from '../../../../src/core/memory/LongTermMemory';
import { MockMemoryStorage, MockMemoryIndex } from '../../utils/test-helpers';
import { MemoryType, MemoryFilter } from '../../../../src/core/memory/types';

describe('Episodic Memory Features', () => {
    let storage: MockMemoryStorage;
    let index: MockMemoryIndex;
    let longTermMemory: LongTermMemory;

    beforeEach(() => {
        storage = new MockMemoryStorage();
        index = new MockMemoryIndex();
        longTermMemory = new LongTermMemory(storage, index);
    });

    test('should store temporal sequences', async () => {
        const sequence = [
            {
                timeSequence: 1,
                location: 'location1',
                actors: ['actor1'],
                actions: ['action1'],
                timestamp: new Date('2025-01-07T13:00:00Z')
            },
            {
                timeSequence: 2,
                location: 'location1',
                actors: ['actor1', 'actor2'],
                actions: ['action2'],
                timestamp: new Date('2025-01-07T13:01:00Z')
            },
            {
                timeSequence: 3,
                location: 'location2',
                actors: ['actor1'],
                actions: ['action3'],
                timestamp: new Date('2025-01-07T13:02:00Z')
            }
        ];

        // Store sequence
        for (const event of sequence) {
            await longTermMemory.store(event, new Map<string, any>([
                ['type', MemoryType.EPISODIC],
                ['location', event.location],
                ['actors', event.actors.join(',')]
            ]));
        }

        // Retrieve by location
        let memories = await longTermMemory.retrieve({
            types: [MemoryType.EPISODIC],
            metadataFilters: [new Map<string, any>([['location', 'location1']])]
        });
        expect(memories.length).toBe(2);

        // Retrieve by actor
        memories = await longTermMemory.retrieve({
            types: [MemoryType.EPISODIC],
            metadataFilters: [new Map<string, any>([['actors', 'actor1,actor2']])]
        });
        expect(memories.length).toBe(1);

        // Verify temporal order
        memories = await longTermMemory.retrieve({
            types: [MemoryType.EPISODIC]
        });
        expect(memories.length).toBe(3);
        expect(memories.map(m => m.content.timeSequence)).toEqual([1, 2, 3]);
    });

    test('should handle event relationships', async () => {
        const event1 = {
            timeSequence: 1,
            location: 'room1',
            actors: ['user1'],
            actions: ['enter'],
            relatedTo: [] as string[]
        };

        const event2 = {
            timeSequence: 2,
            location: 'room1',
            actors: ['user1'],
            actions: ['speak'],
            relatedTo: [] as string[]
        };

        // Store first event
        await longTermMemory.store(event1, new Map<string, any>([
            ['type', MemoryType.EPISODIC],
            ['location', event1.location],
            ['actors', event1.actors.join(',')]
        ]));

        // Get first event ID
        const memories = await longTermMemory.retrieve({
            types: [MemoryType.EPISODIC]
        });
        const event1Id = memories[0].id;

        // Store second event with relationship
        event2.relatedTo.push(event1Id);
        await longTermMemory.store(event2, new Map<string, any>([
            ['type', MemoryType.EPISODIC],
            ['location', event2.location],
            ['actors', event2.actors.join(',')],
            ['relatedTo', event1Id]
        ]));

        // Retrieve related events
        const relatedMemories = await longTermMemory.retrieve({
            types: [MemoryType.EPISODIC],
            metadataFilters: [new Map<string, any>([['relatedTo', event1Id]])]
        });

        expect(relatedMemories.length).toBe(1);
        expect(relatedMemories[0].content.actions).toEqual(['speak']);
    });

    test('should support emotional context', async () => {
        const event = {
            timeSequence: 1,
            location: 'meeting room',
            actors: ['user1', 'user2'],
            actions: ['discuss'],
            emotionalContext: {
                valence: 0.8,  // positive
                arousal: 0.6,  // moderate excitement
                dominance: 0.7 // moderate control
            }
        };

        await longTermMemory.store(event, new Map<string, any>([
            ['type', MemoryType.EPISODIC],
            ['location', event.location],
            ['actors', event.actors.join(',')],
            ['emotionalValence', 0.8]
        ]));

        // Retrieve positive memories
        const positiveMemories = await longTermMemory.retrieve({
            types: [MemoryType.EPISODIC],
            metadataFilters: [new Map<string, any>([['emotionalValence', 0.8]])]
        });

        expect(positiveMemories.length).toBe(1);
        expect(positiveMemories[0].content.emotionalContext.valence).toBe(0.8);
    });
});
