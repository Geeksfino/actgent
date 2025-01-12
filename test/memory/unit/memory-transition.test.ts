import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryTransitionManager } from '../../../src/core/memory/MemoryTransitionManager';
import { createMockWorkingMemory, createMockEpisodicMemory } from '../setup';
import { MemoryEventType, SessionMemoryContext, EmotionalState } from '../../../src/core/memory/types';

describe('MemoryTransitionManager', () => {
    let manager: MemoryTransitionManager;
    let eventsCalled: { [key: string]: boolean };

    beforeEach(() => {
        manager = new MemoryTransitionManager(createMockWorkingMemory(), createMockEpisodicMemory());
        eventsCalled = {
            memoryAccess: false,
            contextChange: false,
            emotionalPeak: false
        };

        // Subscribe to events
        manager.events$.subscribe(event => {
            switch (event.type) {
                case MemoryEventType.MEMORY_ACCESS:
                    eventsCalled.memoryAccess = true;
                    break;
                case MemoryEventType.CONTEXT_CHANGE:
                    eventsCalled.contextChange = true;
                    break;
                case MemoryEventType.EMOTIONAL_PEAK:
                    eventsCalled.emotionalPeak = true;
                    break;
            }
        });
    });

    it('should handle memory access events', async () => {
        const testId = 'test-id';
        manager.onMemoryAccess(testId);
        
        // Wait for event processing
        await new Promise(resolve => setTimeout(resolve, 10));
        
        // Verify that the event was emitted
        expect(eventsCalled.memoryAccess).toBe(true);
    });

    it('should handle context change events', async () => {
        const context: SessionMemoryContext = {
            contextType: 'context_change',
            timestamp: new Date(),
            metadata: new Map(),
            userGoals: new Set(),
            domainContext: new Map(),
            interactionHistory: [],
            emotionalTrends: [],
            emotionalState: { valence: 0, arousal: 0 },
            topicHistory: [],
            userPreferences: new Map(),
            interactionPhase: 'introduction'
        };
        
        manager.onContextChange(context);
        
        // Wait for event processing
        await new Promise(resolve => setTimeout(resolve, 10));
        
        // Verify that the event was emitted
        expect(eventsCalled.contextChange).toBe(true);
    });

    it('should handle emotional peak events', async () => {
        const emotion: EmotionalState = { 
            valence: 0.5, 
            arousal: 0.5 
        };
        
        manager.onEmotionalChange(emotion);
        
        // Wait for event processing
        await new Promise(resolve => setTimeout(resolve, 10));
        
        // Verify that the event was emitted
        expect(eventsCalled.emotionalPeak).toBe(true);
    });
});
