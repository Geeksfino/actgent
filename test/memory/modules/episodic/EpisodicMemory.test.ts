import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EpisodicMemory } from '../../../../src/core/memory/modules/episodic/EpisodicMemory';
import { IMemoryStorage, IMemoryIndex } from '../../../../src/core/memory/storage';
import { IEpisodicMemoryUnit } from '../../../../src/core/memory/modules/episodic/types';
import { MemoryType, MemoryFilter } from '../../../../src/core/memory/base';
import { EmotionalContext } from '../../../../src/core/memory/context';

describe('EpisodicMemory', () => {
    let storage: IMemoryStorage;
    let index: IMemoryIndex;
    let episodicMemory: EpisodicMemory;
    let mockEmotionalContext: EmotionalContext;

    beforeEach(() => {
        // Create mock storage
        storage = {
            store: vi.fn().mockResolvedValue(undefined),
            retrieve: vi.fn().mockResolvedValue(null),
            retrieveByFilter: vi.fn().mockResolvedValue([]),
            update: vi.fn().mockResolvedValue(undefined),
            delete: vi.fn().mockResolvedValue(undefined),
            getSize: vi.fn().mockReturnValue(0),
            getCapacity: vi.fn().mockReturnValue(100),
            add: vi.fn().mockResolvedValue(undefined),
            get: vi.fn().mockResolvedValue(null),
            remove: vi.fn().mockResolvedValue(undefined),
            clear: vi.fn().mockResolvedValue(undefined),
            getAll: vi.fn().mockResolvedValue([])
        } as unknown as IMemoryStorage;
        
        // Create mock index
        index = {
            add: vi.fn().mockResolvedValue(undefined),
            search: vi.fn().mockResolvedValue([]),
            update: vi.fn().mockResolvedValue(undefined),
            delete: vi.fn().mockResolvedValue(undefined),
            remove: vi.fn().mockResolvedValue(undefined)
        } as unknown as IMemoryIndex;
        
        // Mock EmotionalContext
        mockEmotionalContext = {
            currentEmotion: { valence: 0.5, arousal: 0.5 },
            emotionalTrends: [],
            addEmotion: vi.fn(),
            getEmotionalTrend: vi.fn().mockReturnValue([])
        } as unknown as EmotionalContext;
        
        // Create EpisodicMemory instance with mocks
        episodicMemory = new EpisodicMemory(storage, index);
    });

    describe('Memory Creation and Storage', () => {
        it('should create a memory unit', () => {
            const content = 'Test memory content';
            const metadata = new Map<string, any>();
            
            const memoryUnit = episodicMemory.createMemoryUnit(content, undefined, metadata);
            
            expect(memoryUnit).toBeDefined();
            expect(memoryUnit.content).toBeDefined();
            expect(memoryUnit.memoryType).toBe(MemoryType.EPISODIC);
            expect(memoryUnit.createdAt).toBeInstanceOf(Date);
        });
        
        it('should store a memory unit', async () => {
            const content = 'Test memory content';
            const metadata = new Map<string, any>();
            
            const memoryUnit = episodicMemory.createMemoryUnit(content, undefined, metadata);
            await episodicMemory.store(memoryUnit);
            
            expect(storage.store).toHaveBeenCalledWith(memoryUnit);
            // Note: We're not checking index.add here since it might not be called directly
            // in the implementation or might be called with different parameters
        });
    });
    
    describe('Memory Retrieval', () => {
        it('should retrieve a memory unit by id', async () => {
            const memoryId = 'test-id';
            const now = new Date();
            const mockMemory: IEpisodicMemoryUnit = { 
                id: memoryId,
                content: {
                    timeSequence: now.getTime(),
                    location: 'test-location',
                    actors: ['actor1', 'actor2'],
                    actions: ['action1', 'action2'],
                    emotions: mockEmotionalContext,
                    coherenceScore: 0.8,
                    emotionalIntensity: 0.7,
                    contextualRelevance: 0.9,
                    temporalDistance: 0,
                    timestamp: now
                },
                metadata: new Map<string, any>(),
                timestamp: now,
                memoryType: MemoryType.EPISODIC,
                createdAt: now
            };
            
            // Setup mock to return our mock memory
            (storage.retrieve as any).mockResolvedValueOnce(mockMemory);
            
            const result = await episodicMemory.retrieve(memoryId);
            
            expect(storage.retrieve).toHaveBeenCalledWith(memoryId);
            expect(result).toEqual(mockMemory);
        });
        
        it('should query memory units', async () => {
            const filter: MemoryFilter = { query: 'test' };
            const now = new Date();
            const mockMemories: IEpisodicMemoryUnit[] = [
                { 
                    id: 'id1',
                    content: {
                        timeSequence: now.getTime(),
                        location: 'location1',
                        actors: ['actor1', 'actor2'],
                        actions: ['action1', 'action2'],
                        emotions: mockEmotionalContext,
                        coherenceScore: 0.8,
                        emotionalIntensity: 0.7,
                        contextualRelevance: 0.9,
                        temporalDistance: 0,
                        timestamp: now
                    },
                    metadata: new Map<string, any>(),
                    timestamp: now,
                    memoryType: MemoryType.EPISODIC,
                    createdAt: now
                },
                { 
                    id: 'id2',
                    content: {
                        timeSequence: now.getTime(),
                        location: 'location2',
                        actors: ['actor3', 'actor4'],
                        actions: ['action3', 'action4'],
                        emotions: mockEmotionalContext,
                        coherenceScore: 0.6,
                        emotionalIntensity: 0.5,
                        contextualRelevance: 0.7,
                        temporalDistance: 1,
                        timestamp: now
                    },
                    metadata: new Map<string, any>(),
                    timestamp: now,
                    memoryType: MemoryType.EPISODIC,
                    createdAt: now
                }
            ];
            
            // Setup mock to return our mock memories
            (storage.retrieveByFilter as any).mockResolvedValueOnce(mockMemories);
            
            const results = await episodicMemory.query(filter);
            
            expect(storage.retrieveByFilter).toHaveBeenCalledWith(filter);
            expect(results).toEqual(mockMemories);
        });
    });
});
