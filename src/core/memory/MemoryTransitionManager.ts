import { 
    IMemoryUnit, 
    MemoryType, 
    ConsolidationStatus,
    TransitionTrigger,
    SessionMemoryContext,
    EmotionalState,
    EmotionalContext
} from './types';
import { WorkingMemory } from './WorkingMemory';
import { EpisodicMemory } from './EpisodicMemory';

/**
 * Manages the transition of memories between different memory stores
 * based on various triggers and conditions.
 */
export class MemoryTransitionManager {
    private workingMemory: WorkingMemory;
    private episodicMemory: EpisodicMemory;
    private lastCheck: Date;
    private currentContext?: SessionMemoryContext;

    constructor(workingMemory: WorkingMemory, episodicMemory: EpisodicMemory) {
        this.workingMemory = workingMemory;
        this.episodicMemory = episodicMemory;
        this.lastCheck = new Date();
    }

    /**
     * Update the current context used for memory transitions
     */
    public updateContext(context: SessionMemoryContext): void {
        this.currentContext = context;
    }

    /**
     * Check for memories that need to be transitioned and handle them
     */
    public async checkAndTransition(): Promise<void> {
        const now = new Date();
        
        // Get all memories from working memory
        const memories = await this.workingMemory.retrieve({
            types: [MemoryType.EPISODIC, MemoryType.CONTEXTUAL]
        });

        for (const memory of memories) {
            const shouldTransition = await this.shouldTransitionMemory(memory);
            if (shouldTransition) {
                await this.transitionMemory(memory);
            }
        }

        this.lastCheck = now;
    }

    /**
     * Determine if a memory should be transitioned based on various triggers
     */
    private async shouldTransitionMemory(memory: IMemoryUnit): Promise<boolean> {
        if (!this.currentContext) return false;

        // Check time-based trigger
        const timeTrigger = await this.checkTimeTrigger(memory);
        if (timeTrigger) return true;

        // Check context-based trigger
        const contextTrigger = await this.checkContextTrigger(memory);
        if (contextTrigger) return true;

        // Check emotion-based trigger
        const emotionTrigger = await this.checkEmotionTrigger(memory);
        if (emotionTrigger) return true;

        // Check consolidation trigger
        const consolidationTrigger = await this.checkConsolidationTrigger(memory);
        if (consolidationTrigger) return true;

        return false;
    }

    /**
     * Check if memory should transition based on time
     */
    private async checkTimeTrigger(memory: IMemoryUnit): Promise<boolean> {
        const timeThreshold = 30 * 60 * 1000; // 30 minutes
        const now = new Date();
        const memoryAge = now.getTime() - memory.timestamp.getTime();
        
        return memoryAge > timeThreshold;
    }

    /**
     * Check if memory should transition based on context changes
     */
    private async checkContextTrigger(memory: IMemoryUnit): Promise<boolean> {
        if (!this.currentContext) return false;

        const memoryContext = memory.metadata.get('context') as SessionMemoryContext | undefined;
        if (!memoryContext) return false;

        // Calculate context overlap score
        const contextScore = this.calculateContextOverlap(memoryContext, this.currentContext);
        
        // If context overlap is low, consider transitioning
        return contextScore < 0.3; // Threshold for context relevance
    }

    /**
     * Check if memory should transition based on emotional state
     */
    private async checkEmotionTrigger(memory: IMemoryUnit): Promise<boolean> {
        if (!this.currentContext) return false;

        const memoryContext = memory.metadata.get('context') as SessionMemoryContext | undefined;
        if (!memoryContext?.emotionalState) return false;

        // Calculate emotional state difference
        const emotionalScore = this.calculateEmotionalAlignment(
            memoryContext.emotionalState,
            this.currentContext.emotionalState
        );

        // If emotional alignment is low, consider transitioning
        return emotionalScore < 0.3; // Threshold for emotional relevance
    }

    /**
     * Check if memory should transition based on consolidation status
     */
    private async checkConsolidationTrigger(memory: IMemoryUnit): Promise<boolean> {
        const consolidationStatus = memory.metadata.get('consolidationStatus') as ConsolidationStatus | undefined;
        return consolidationStatus === ConsolidationStatus.CONSOLIDATED;
    }

    /**
     * Calculate how well two contexts overlap
     */
    private calculateContextOverlap(context1: SessionMemoryContext, context2: SessionMemoryContext): number {
        let totalScore = 0;
        let weights = 0;

        // Compare topics (30% weight)
        if (context1.topicHistory.length > 0 && context2.topicHistory.length > 0) {
            const topicScore = context1.topicHistory
                .map((topic: string, index: number) => {
                    const position = context2.topicHistory.indexOf(topic);
                    if (position === -1) return 0;
                    return 1 - (Math.abs(position - index) / Math.max(context1.topicHistory.length, context2.topicHistory.length));
                })
                .reduce((sum: number, score: number) => sum + score, 0) / context1.topicHistory.length;

            totalScore += topicScore * 0.3;
            weights += 0.3;
        }

        // Compare goals (40% weight)
        if (context1.userGoals.size > 0 && context2.userGoals.size > 0) {
            const goals1 = Array.from(context1.userGoals);
            const goals2 = Array.from(context2.userGoals);
            const commonGoals = goals1.filter(goal => goals2.includes(goal));
            const goalScore = commonGoals.length / Math.max(goals1.length, goals2.length);

            totalScore += goalScore * 0.4;
            weights += 0.4;
        }

        // Compare emotional states (30% weight)
        if (context1.emotionalState && context2.emotionalState) {
            const emotionScore = context1.emotionalTrends
                .map((emotion: EmotionalState, index: number) => {
                    const other = context2.emotionalTrends[index];
                    if (!other) return 0;
                    const valenceDiff = Math.abs(emotion.valence - other.valence);
                    const arousalDiff = Math.abs(emotion.arousal - other.arousal);
                    return 1 - ((valenceDiff + arousalDiff) / 4); // Normalize to 0-1
                })
                .reduce((sum: number, score: number) => sum + score, 0) / context1.emotionalTrends.length;

            totalScore += emotionScore * 0.3;
            weights += 0.3;
        }

        return weights > 0 ? totalScore / weights : 0;
    }

    /**
     * Calculate emotional alignment between two emotional states
     */
    private calculateEmotionalAlignment(emotion1: EmotionalContext, emotion2: EmotionalContext): number {
        const e1 = emotion1.getCurrentEmotion();
        const e2 = emotion2.getCurrentEmotion();
        
        if (!e1 || !e2) return 0;
        
        const valenceDiff = Math.abs(e1.valence - e2.valence);
        const arousalDiff = Math.abs(e1.arousal - e2.arousal);
        
        // Normalize differences to 0-1 scale
        return 1 - ((valenceDiff + arousalDiff) / 4);
    }

    /**
     * Handle the transition of a memory between stores
     */
    private async transitionMemory(memory: IMemoryUnit): Promise<void> {
        try {
            // Add transition metadata
            memory.metadata.set('transitionType', TransitionTrigger.TIME_BASED);
            memory.metadata.set('transitionTimestamp', new Date());

            // Store in episodic memory
            await this.episodicMemory.store(memory);

            // Remove from working memory
            await this.workingMemory.delete(memory.id);

        } catch (error) {
            console.error('Error transitioning memory:', error);
            // Consider adding retry logic or error handling here
        }
    }
}
