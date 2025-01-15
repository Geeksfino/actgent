import { EmotionalContext, EmotionalState, EmotionalTrendEntry } from '../context';

/**
 * Emotional context implementation
 */
export class EmotionalContextImpl implements EmotionalContext {
    private emotions: EmotionalTrendEntry[] = [];
    private maxHistory: number = 10;

    addEmotion(emotion: EmotionalState): void {
        this.emotions.push({ timestamp: new Date(), emotion });
        if (this.emotions.length > this.maxHistory) {
            this.emotions.shift();
        }
    }

    get currentEmotion(): EmotionalState {
        return this.emotions[this.emotions.length - 1].emotion;
    }

    get emotionalTrends(): EmotionalTrendEntry[] {
        return [...this.emotions];
    }

    getEmotionalTrend(timeRange: { start: Date; end: Date }): EmotionalTrendEntry[] {
        return this.emotions.filter((entry) => entry.timestamp >= timeRange.start && entry.timestamp <= timeRange.end);
    }
}
