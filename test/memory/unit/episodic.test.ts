import { describe, test, expect, beforeEach } from 'bun:test';
import { LongTermMemory } from '../../../src/core/memory/LongTermMemory';
import { MockMemoryStorage, MockMemoryIndex } from '../utils/test-helpers';
import { MemoryType, MemoryFilter } from '../../..//src/core/memory/types';
import { EpisodicMemory } from '../../../src/core/memory/EpisodicMemory';

describe('Episodic Memory Features', () => {
    let storage: MockMemoryStorage;
    let index: MockMemoryIndex;
    let episodicMemory: EpisodicMemory;

    beforeEach(() => {
        storage = new MockMemoryStorage();
        index = new MockMemoryIndex();
        episodicMemory = new EpisodicMemory(storage, index);
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
            await episodicMemory.store(event, new Map<string, any>([
                ['type', MemoryType.EPISODIC],
                ['location', event.location],
                ['actors', event.actors.join(',')],
                ['actions', event.actions.join(',')]
            ]));
        }

        // Retrieve by location
        let memories = await episodicMemory.retrieve({
            types: [MemoryType.EPISODIC],
            metadataFilters: [new Map<string, any>([['location', 'location1']])]
        });
        expect(memories.length).toBe(2);

        // Retrieve by actor
        memories = await episodicMemory.retrieve({
            types: [MemoryType.EPISODIC],
            metadataFilters: [new Map<string, any>([['actors', 'actor1,actor2']])]
        });
        expect(memories.length).toBe(1);

        // Verify temporal order
        memories = await episodicMemory.retrieve({
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
        await episodicMemory.store(event1, new Map<string, any>([
            ['type', MemoryType.EPISODIC],
            ['location', event1.location],
            ['actors', event1.actors.join(',')],
            ['actions', event1.actions.join(',')]
        ]));

        // Get first event ID
        const memories = await episodicMemory.retrieve({
            types: [MemoryType.EPISODIC]
        });
        const event1Id = memories[0].id;

        // Store second event with relationship
        event2.relatedTo.push(event1Id);
        await episodicMemory.store(event2, new Map<string, any>([
            ['type', MemoryType.EPISODIC],
            ['location', event2.location],
            ['actors', event2.actors.join(',')],
            ['actions', event2.actions.join(',')],
            ['relatedTo', event1Id]
        ]));

        // Verify relationship
        const relatedMemories = await episodicMemory.retrieve({
            types: [MemoryType.EPISODIC],
            metadataFilters: [new Map<string, any>([['relatedTo', event1Id]])]
        });
        expect(relatedMemories.length).toBe(1);
        expect(relatedMemories[0].content.actions).toEqual(['speak']);
    });

    test('should track access counts and cleanup old memories', async () => {
        const oldEvent = {
            timeSequence: 1,
            location: 'oldLocation',
            actors: ['actor1'],
            actions: ['action1'],
            timestamp: new Date('2024-12-31T00:00:00Z') // Old event
        };

        const recentEvent = {
            timeSequence: 2,
            location: 'newLocation',
            actors: ['actor2'],
            actions: ['action2'],
            timestamp: new Date('2025-01-07T00:00:00Z') // Recent event
        };

        // Store both events
        await episodicMemory.store(oldEvent, new Map<string, any>([
            ['type', MemoryType.EPISODIC],
            ['location', oldEvent.location],
            ['actors', oldEvent.actors.join(',')],
            ['actions', oldEvent.actions.join(',')],
            ['timestamp', oldEvent.timestamp.getTime()]
        ]));

        await episodicMemory.store(recentEvent, new Map<string, any>([
            ['type', MemoryType.EPISODIC],
            ['location', recentEvent.location],
            ['actors', recentEvent.actors.join(',')],
            ['actions', recentEvent.actions.join(',')],
            ['timestamp', recentEvent.timestamp.getTime()]
        ]));

        // Access old event multiple times to increase access count
        const memories = await episodicMemory.retrieve({
            types: [MemoryType.EPISODIC],
            metadataFilters: [new Map<string, any>([['location', 'oldLocation']])]
        });
        const oldMemoryId = memories[0].id;

        // Access the old memory 3 times
        await episodicMemory.retrieve(oldMemoryId);
        await episodicMemory.retrieve(oldMemoryId);
        await episodicMemory.retrieve(oldMemoryId);

        // Trigger cleanup
        await (episodicMemory as any).cleanup();

        // Verify old memory is kept due to high access count
        const remainingMemories = await episodicMemory.retrieve({
            types: [MemoryType.EPISODIC]
        });
        expect(remainingMemories.length).toBe(2);
        expect(remainingMemories.some(m => m.content.location === 'oldLocation')).toBe(true);
    });

    test('should find similar experiences', async () => {
        const event1 = {
            timeSequence: 1,
            location: 'kitchen',
            actors: ['user1'],
            actions: ['cook', 'eat'],
            emotions: new Map([['happy', 0.8]])
        };

        const event2 = {
            timeSequence: 2,
            location: 'kitchen',
            actors: ['user2'],
            actions: ['cook'],
            emotions: new Map([['happy', 0.7]])
        };

        const event3 = {
            timeSequence: 3,
            location: 'bedroom',
            actors: ['user1'],
            actions: ['sleep'],
            emotions: new Map([['tired', 0.9]])
        };

        // Store all events
        await episodicMemory.store(event1, new Map<string, any>([
            ['type', MemoryType.EPISODIC],
            ['location', event1.location],
            ['actors', event1.actors.join(',')],
            ['actions', event1.actions.join(',')]
        ]));

        await episodicMemory.store(event2, new Map<string, any>([
            ['type', MemoryType.EPISODIC],
            ['location', event2.location],
            ['actors', event2.actors.join(',')],
            ['actions', event2.actions.join(',')]
        ]));

        await episodicMemory.store(event3, new Map<string, any>([
            ['type', MemoryType.EPISODIC],
            ['location', event3.location],
            ['actors', event3.actors.join(',')],
            ['actions', event3.actions.join(',')]
        ]));

        // Find similar experiences to event1
        const similarExperiences = await episodicMemory.findSimilarExperiences(event1 as any);
        
        // Should find event2 as similar (same location, cooking action)
        expect(similarExperiences.length).toBeGreaterThan(0);
        expect(similarExperiences.some(exp => 
            exp.content.location === 'kitchen' && 
            exp.content.actions.includes('cook')
        )).toBe(true);
    });

    test('should consolidate similar memories', async () => {
        const baseEvent = {
            timeSequence: 1,
            location: 'kitchen',
            actors: ['user1', 'user2'],
            actions: ['cook', 'chat'],
            emotions: new Map([['happy', 0.8], ['excited', 0.6]]),
            timestamp: new Date('2025-01-08T13:00:00Z')
        };

        // Create similar events with slight variations
        const events = [
            baseEvent,
            {
                ...baseEvent,
                timeSequence: 2,
                timestamp: new Date('2025-01-08T13:30:00Z'),
                emotions: new Map([['happy', 0.7], ['excited', 0.5]])
            },
            {
                ...baseEvent,
                timeSequence: 3,
                timestamp: new Date('2025-01-08T14:00:00Z'),
                emotions: new Map([['happy', 0.9], ['excited', 0.7]])
            }
        ];

        // Store all events
        for (const event of events) {
            await episodicMemory.store(event, new Map<string, any>([
                ['type', MemoryType.EPISODIC],
                ['location', event.location],
                ['actors', event.actors.join(',')],
                ['actions', event.actions.join(',')]
            ]));
        }

        // Wait for consolidation to occur
        await new Promise(resolve => setTimeout(resolve, 100));

        // Check for consolidated memory
        const memories = await episodicMemory.retrieve({
            types: [MemoryType.EPISODIC],
            metadataFilters: [new Map<string, any>([
                ['consolidationStatus', 'consolidated']
            ])]
        });

        expect(memories.length).toBeGreaterThan(0);
        const consolidated = memories[0];
        expect(consolidated.content.location).toBe('kitchen');
        expect(consolidated.content.actors).toEqual(['user1', 'user2']);
        expect(consolidated.content.actions).toEqual(['cook', 'chat']);
        expect(consolidated.content.emotions.get('happy')).toBeGreaterThan(0.7);
    });

    test('should retain important memories during cleanup', async () => {
        const importantEvent = {
            timeSequence: 1,
            location: 'conference_room',
            actors: ['CEO', 'team'],
            actions: ['present', 'discuss'],
            emotions: new Map([
                ['excited', 0.9],
                ['proud', 0.8]
            ]),
            timestamp: new Date('2024-12-31T00:00:00Z') // Old but important
        };

        const unimportantEvent = {
            timeSequence: 2,
            location: 'hallway',
            actors: ['employee'],
            actions: ['walk'],
            emotions: new Map([['neutral', 0.3]]),
            timestamp: new Date('2024-12-31T00:00:00Z') // Old and unimportant
        };

        // Store both events
        await episodicMemory.store(importantEvent, new Map<string, any>([
            ['type', MemoryType.EPISODIC],
            ['location', importantEvent.location],
            ['actors', importantEvent.actors.join(',')],
            ['actions', importantEvent.actions.join(',')]
        ]));

        await episodicMemory.store(unimportantEvent, new Map<string, any>([
            ['type', MemoryType.EPISODIC],
            ['location', unimportantEvent.location],
            ['actors', unimportantEvent.actors.join(',')],
            ['actions', unimportantEvent.actions.join(',')]
        ]));

        // Trigger cleanup
        await (episodicMemory as any).cleanup();

        // Check retained memories
        const memories = await episodicMemory.retrieve({
            types: [MemoryType.EPISODIC]
        });

        expect(memories.length).toBe(1);
        expect(memories[0].content.location).toBe('conference_room');
        expect(memories[0].metadata.get('importanceScore')).toBeGreaterThan(0.5);
        expect(memories[0].metadata.get('emotionalSignificance')).toBeGreaterThan(0.5);
    });

    test('should calculate emotional significance correctly', async () => {
        const events = [
            {
                timeSequence: 1,
                location: 'home',
                actors: ['family'],
                actions: ['celebrate'],
                emotions: new Map([
                    ['happy', 0.9],
                    ['excited', 0.8],
                    ['proud', 0.7]
                ]),
                timestamp: new Date()
            },
            {
                timeSequence: 2,
                location: 'office',
                actors: ['colleague'],
                actions: ['work'],
                emotions: new Map([
                    ['neutral', 0.5],
                    ['focused', 0.6]
                ]),
                timestamp: new Date()
            },
            {
                timeSequence: 3,
                location: 'hospital',
                actors: ['patient'],
                actions: ['wait'],
                emotions: new Map([
                    ['anxious', 0.8],
                    ['afraid', 0.7]
                ]),
                timestamp: new Date()
            }
        ];

        // Store all events
        for (const event of events) {
            await episodicMemory.store(event, new Map<string, any>([
                ['type', MemoryType.EPISODIC],
                ['location', event.location],
                ['actors', event.actors.join(',')],
                ['actions', event.actions.join(',')]
            ]));
        }

        // Retrieve and check emotional significance
        const memories = await episodicMemory.retrieve({
            types: [MemoryType.EPISODIC]
        });

        // Happy event should have high emotional significance
        const happyMemory = memories.find(m => m.content.location === 'home');
        expect(happyMemory?.metadata.get('emotionalSignificance')).toBeGreaterThan(0.7);

        // Neutral event should have lower emotional significance
        const neutralMemory = memories.find(m => m.content.location === 'office');
        expect(neutralMemory?.metadata.get('emotionalSignificance')).toBeLessThan(0.7);

        // Negative event should have high emotional significance
        const negativeMemory = memories.find(m => m.content.location === 'hospital');
        expect(negativeMemory?.metadata.get('emotionalSignificance')).toBeGreaterThan(0.7);
    });
});
