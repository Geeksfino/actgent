import { IContextOptimizer, ConversationMessage, ContextMetrics } from '../types';
import { RelevanceEvaluator } from '../evaluators/RelevanceEvaluator';
import { RelevanceMetric } from '../metrics/RelevanceMetric';

/**
 * Optimizer that filters out irrelevant messages
 */
export class RelevanceOptimizer implements IContextOptimizer {
    private relevanceEvaluator: RelevanceEvaluator;
    private relevanceMetric: RelevanceMetric;

    constructor() {
        this.relevanceEvaluator = new RelevanceEvaluator();
        this.relevanceMetric = new RelevanceMetric();
    }

    public shouldOptimize(metrics: ContextMetrics): boolean {
        return metrics.averageRelevance < this.relevanceMetric.threshold;
    }

    public async optimize(messages: ConversationMessage[]): Promise<ConversationMessage[]> {
        // Sort messages by relevance and keep only the most relevant ones
        const sortedMessages = [...messages].sort((a, b) => b.relevanceScore - a.relevanceScore);
        
        // Keep messages above threshold
        return sortedMessages.filter(msg => msg.relevanceScore >= this.relevanceMetric.threshold);
    }
}
