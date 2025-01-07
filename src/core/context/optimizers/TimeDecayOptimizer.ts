import { IContextOptimizer, ConversationMessage, ContextMetrics } from '../types';
import { AgeMetric } from '../metrics/AgeMetric';

/**
 * Optimizer that applies time-based decay to message importance
 */
export class TimeDecayOptimizer implements IContextOptimizer {
    private ageMetric: AgeMetric;
    private decayFactor: number;

    constructor(decayFactor: number = 0.5) {
        this.ageMetric = new AgeMetric();
        this.decayFactor = decayFactor;
    }

    public shouldOptimize(metrics: ContextMetrics): boolean {
        return metrics.oldestMessageAge > this.ageMetric.threshold;
    }

    public async optimize(messages: ConversationMessage[]): Promise<ConversationMessage[]> {
        const now = new Date().getTime();
        
        return messages.map(msg => {
            const age = now - msg.timestamp.getTime();
            const decayedImportance = msg.importance * Math.exp(-this.decayFactor * age / this.ageMetric.threshold);
            
            return {
                ...msg,
                importance: decayedImportance
            };
        }).filter(msg => msg.importance >= 0.1); // Filter out messages with very low importance
    }
}
