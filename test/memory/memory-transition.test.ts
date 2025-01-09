import { describe, test, expect, beforeEach, jest } from 'bun:test';
import { 
    MemoryTransitionManager,
    EnhancedTransitionConfig 
} from '../../src/core/memory/MemoryTransitionManager';
import { 
    IMemoryUnit,
    EnhancedMemoryContext,
    MemoryType,
    EmotionalContext,
    EmotionalContextImpl
} from '../../src/core/memory/types';
import { WorkingMemory } from '../../src/core/memory/WorkingMemory';
import { EpisodicMemory } from '../../src/core/memory/EpisodicMemory';
import { LongTermMemory } from '../../src/core/memory/LongTermMemory';
import { InMemoryStorage } from '../../src/core/memory/storage/InMemoryStorage';
import { InMemoryIndex } from '../../src/core/memory/storage/InMemoryIndex';

describe('MemoryTransitionManager', () => {
    let transitionManager: MemoryTransitionManager;
    let workingMemory: WorkingMemory;
    let episodicMemory: EpisodicMemory;
    let longTermMemory: LongTermMemory;
    let storage: InMemoryStorage;
    let index: InMemoryIndex;

    beforeEach(() => {
        storage = new InMemoryStorage();
        index = new InMemoryIndex();
        workingMemory = new WorkingMemory(storage, index);
        episodicMemory = new EpisodicMemory(storage, index);
        longTermMemory = new LongTermMemory(storage, index);

        const config: EnhancedTransitionConfig = {
            accessCountThreshold: 5,
            timeThresholdMs: 5 * 60 * 1000,
            capacityThreshold: 100,
            importanceThreshold: 0.7,
            contextSwitchThreshold: 0.6,
            emotionalSalienceThreshold: 0.7,
            coherenceThreshold: 0.6,
            consistencyThreshold: 0.7,
            topicContinuityThreshold: 0.6,
            emotionalContinuityThreshold: 0.6,
            temporalProximityThreshold: 0.7,
            goalAlignmentThreshold: 0.7,
            emotionalIntensityThreshold: 0.7,
            emotionalNoveltyThreshold: 0.6,
            emotionalRelevanceThreshold: 0.7
        };

        transitionManager = new MemoryTransitionManager(
            workingMemory,
            episodicMemory,
            longTermMemory,
            config
        );
    });

    test('should handle user instruction to remember', async () => {
        const memory: IMemoryUnit = {
            id: 'test-memory',
            content: {
                text: 'Remember to buy groceries',
                emotions: new EmotionalContextImpl(
                    new Map([['joy', 0.8]]),
                    0.7,
                    0.6,
                    0.5
                )
            },
            metadata: new Map([
                ['type', MemoryType.WORKING],
                ['topic', 'shopping']
            ]),
            timestamp: new Date(),
            accessCount: 1,
            lastAccessed: new Date()
        };

        await workingMemory.store(memory.content, memory.metadata);
        await transitionManager.checkAndTransition(memory);

        // Check if memory was transitioned to episodic memory
        const episodicMemories = await episodicMemory.retrieve({ types: [MemoryType.EPISODIC] });
        expect(episodicMemories.length).toBe(1);
        expect(episodicMemories[0].metadata.get('topic')).toBe('shopping');
    });

    test('should transition based on emotional peak', async () => {
        const memory: IMemoryUnit = {
            id: 'emotional-memory',
            content: {
                text: 'Won the lottery!',
                emotions: new EmotionalContextImpl(
                    new Map([['joy', 0.9], ['excitement', 0.8]]),
                    0.9,
                    0.8,
                    0.7
                )
            },
            metadata: new Map([
                ['type', MemoryType.WORKING],
                ['topic', 'life event']
            ]),
            timestamp: new Date(),
            accessCount: 1,
            lastAccessed: new Date()
        };

        await workingMemory.store(memory.content, memory.metadata);
        await transitionManager.checkAndTransition(memory);

        // Check if memory was transitioned to episodic memory
        const episodicMemories = await episodicMemory.retrieve({ types: [MemoryType.EPISODIC] });
        expect(episodicMemories.length).toBe(1);
        const transitionedMemory = episodicMemories[0];
        expect(transitionedMemory.content.emotions.emotions.get('joy')).toBe(0.9);
    });

    test('should transition based on goal relevance', async () => {
        const memory: IMemoryUnit = {
            id: 'goal-memory',
            content: {
                text: 'Found a great React Native tutorial',
                emotions: new EmotionalContextImpl()
            },
            metadata: new Map([
                ['type', MemoryType.WORKING],
                ['topic', 'learning'],
                ['goal', 'Learn React Native']
            ]),
            timestamp: new Date(),
            accessCount: 1,
            lastAccessed: new Date()
        };

        // Set user goals in context
        (transitionManager as any).currentContext.userGoals.add('Learn React Native');

        await workingMemory.store(memory.content, memory.metadata);
        await transitionManager.checkAndTransition(memory);

        // Check if memory was transitioned to episodic memory
        const episodicMemories = await episodicMemory.retrieve({ types: [MemoryType.EPISODIC] });
        expect(episodicMemories.length).toBe(1);
        expect(episodicMemories[0].metadata.get('goal')).toBe('Learn React Native');
    });
});
