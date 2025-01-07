import { IHistoryManager, ConversationMessage, IContextOptimizer, IContextMetric, ContextMetrics } from './types';
import { WorkingMemory } from '../memory/WorkingMemory';
import { TokenMetric } from './metrics/TokenMetric';
import { RelevanceMetric } from './metrics/RelevanceMetric';
import { AgeMetric } from './metrics/AgeMetric';
import { SummarizationOptimizer } from './optimizers/SummarizationOptimizer';
import { RelevanceOptimizer } from './optimizers/RelevanceOptimizer';
import { TimeDecayOptimizer } from './optimizers/TimeDecayOptimizer';

/**
 * Manages conversation history with smart optimization strategies
 */
export class SmartHistoryManager implements IHistoryManager {
    private messages: ConversationMessage[] = [];
    private optimizers: Map<string, IContextOptimizer> = new Map();
    private metrics: Map<string, IContextMetric> = new Map();
    private workingMemory: WorkingMemory;

    constructor(workingMemory: WorkingMemory) {
        this.workingMemory = workingMemory;
        this.initializeOptimizers();
        this.initializeMetrics();
    }

    private initializeOptimizers(): void {
        this.optimizers.set('summarization', new SummarizationOptimizer());
        this.optimizers.set('relevance', new RelevanceOptimizer());
        this.optimizers.set('timeDecay', new TimeDecayOptimizer());
    }

    private initializeMetrics(): void {
        this.metrics.set('token', new TokenMetric());
        this.metrics.set('relevance', new RelevanceMetric());
        this.metrics.set('age', new AgeMetric());
    }

    public addMessage(message: ConversationMessage): void {
        this.messages.push(message);
        this.checkOptimizationTriggers();
    }

    public async getContext(): Promise<string> {
        return this.messages.map(msg => msg.content).join('\n');
    }

    public async optimize(): Promise<void> {
        const metrics = this.updateMetrics();
        
        for (const optimizer of this.optimizers.values()) {
            if (optimizer.shouldOptimize(metrics)) {
                this.messages = await optimizer.optimize(this.messages);
            }
        }
    }

    private async checkOptimizationTriggers(): Promise<void> {
        const metrics = this.updateMetrics();
        let shouldOptimize = false;

        for (const optimizer of this.optimizers.values()) {
            if (optimizer.shouldOptimize(metrics)) {
                shouldOptimize = true;
                break;
            }
        }

        if (shouldOptimize) {
            await this.optimize();
        }
    }

    private updateMetrics(): ContextMetrics {
        return {
            tokenCount: this.metrics.get('token')!.measure(this.messages),
            messageCount: this.messages.length,
            averageRelevance: this.metrics.get('relevance')!.measure(this.messages),
            oldestMessageAge: this.metrics.get('age')!.measure(this.messages)
        };
    }
}
