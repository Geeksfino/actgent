import { IContextMetric, ConversationMessage } from '../types';
import { RelevanceEvaluator } from '../evaluators/RelevanceEvaluator';

/**
 * Metric for measuring message relevance
 */
export class RelevanceMetric implements IContextMetric {
    private relevanceEvaluator: RelevanceEvaluator;
    public threshold: number;

    constructor(minRelevance: number = 0.5) {
        this.relevanceEvaluator = new RelevanceEvaluator();
        this.threshold = minRelevance;
    }

    public measure(messages: ConversationMessage[]): number {
        if (messages.length === 0) return 1;
        
        const totalRelevance = messages.reduce((sum, msg) => sum + msg.relevanceScore, 0);
        return totalRelevance / messages.length;
    }
}
