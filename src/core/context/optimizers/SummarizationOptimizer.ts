import { IContextOptimizer, ConversationMessage, ContextMetrics } from '../types';
import { SummarizationEngine } from '../engines/SummarizationEngine';
import { TokenMetric } from '../metrics/TokenMetric';

/**
 * Optimizer that summarizes messages when token count is too high
 */
export class SummarizationOptimizer implements IContextOptimizer {
    private summarizationEngine: SummarizationEngine;
    private tokenMetric: TokenMetric;

    constructor() {
        this.summarizationEngine = new SummarizationEngine();
        this.tokenMetric = new TokenMetric();
    }

    public shouldOptimize(metrics: ContextMetrics): boolean {
        return metrics.tokenCount > this.tokenMetric.threshold;
    }

    public async optimize(messages: ConversationMessage[]): Promise<ConversationMessage[]> {
        const summary = await this.summarizationEngine.summarize(messages);
        
        // Create a new summary message
        const summaryMessage: ConversationMessage = {
            id: `summary-${Date.now()}`,
            content: summary,
            role: 'system',
            timestamp: new Date(),
            relevanceScore: 1,
            importance: 1,
            tokens: this.tokenMetric.count(summary)
        };

        // Return the summary message plus the most recent messages
        return [summaryMessage, ...messages.slice(-5)];
    }
}
