import { IHistoryManager, ConversationMessage, IContextOptimizer, IContextMetric, ContextMetrics} from './types';
import { WorkingMemory } from '../memory/WorkingMemory';
import { TokenMetric } from './metrics/TokenMetric';
import { RelevanceMetric } from './metrics/RelevanceMetric';
import { AgeMetric } from './metrics/AgeMetric';
import { SummarizationOptimizer } from './optimizers/SummarizationOptimizer';
import { RelevanceOptimizer } from './optimizers/RelevanceOptimizer';
import { TimeDecayOptimizer } from './optimizers/TimeDecayOptimizer';
import { MemoryType } from '../memory/types';

/**
 * Manages conversation history with smart optimization strategies
 */
export class SmartHistoryManager implements IHistoryManager {
    private messages: ConversationMessage[] = [];
    private optimizers: Map<string, IContextOptimizer> = new Map();
    private metrics: Map<string, IContextMetric> = new Map();


    constructor(private workingMemory: WorkingMemory) {
        this.messages = [];
        this.optimizers = new Map();
        this.metrics = new Map();
        this.initializeOptimizers();
        this.initializeMetrics();
    }

    private initializeOptimizers(): void {
        this.optimizers.set('relevance', {
            shouldOptimize: (metrics: ContextMetrics) => metrics.averageRelevance < 0.7,
            optimize: async (messages: ConversationMessage[]) => 
                messages.filter(m => m.relevanceScore >= 0.7)
        });
    }

    private initializeMetrics(): void {
        this.metrics.set('token', new TokenMetric());
        this.metrics.set('relevance', new RelevanceMetric());
        this.metrics.set('age', new AgeMetric());
    }

    public async addMessage(message: ConversationMessage): Promise<void> {
        this.messages.push(message);
        
        // Store in working memory
        const metadata = new Map<string, any>([
            ['type', MemoryType.WORKING],
            ['relevanceScore', message.relevanceScore],
            ['importance', message.importance],
            ['tokens', message.tokens],
            ['role', message.role],
            ['expiresAt', Date.now() + 300000] // 5 minutes
        ]);

        // Store message content and metadata separately
        await this.workingMemory.store(
            { content: message.content, role: message.role },
            metadata
        );
        await this.checkOptimizationTriggers();
    }

    public async getContext(): Promise<string> {
        const messageStrings = this.messages.map(msg => {
            let msgStr = `${msg.role}: ${msg.content}`;
            
            // Include environmental context if present
            if (msg.metadata?.environment) {
                const env = msg.metadata.environment;
                msgStr += `\nContext: ${JSON.stringify(env)}`;
            }
            
            return msgStr;
        });

        return messageStrings.join('\n');
    }

    public async optimize(): Promise<void> {
        if (this.messages.length === 0) return;
    
        try {
            const metrics = this.updateMetrics();
            let optimizedMessages = [...this.messages];
            
            for (const optimizer of this.optimizers.values()) {
                if (optimizer.shouldOptimize(metrics)) {
                    const result = await optimizer.optimize(optimizedMessages);
                    if (result && result.length > 0) {
                        optimizedMessages = result;
                    }
                }
            }
    
            if (optimizedMessages.length > 0) {
                this.messages = optimizedMessages;
                await this.syncWithWorkingMemory();
            }
        } catch (error) {
            console.error('Optimization error:', error);
        }
    }

    private async syncWithWorkingMemory(): Promise<void> {
        // Clear existing messages and store optimized ones
        const workingMemories = await this.workingMemory.retrieve({
            types: [MemoryType.WORKING]
        });

        // Store new messages
        for (const message of this.messages) {
            const metadata = new Map<string, any>([
                ['type', MemoryType.WORKING],
                ['relevanceScore', message.relevanceScore],
                ['importance', message.importance],
                ['tokens', message.tokens],
                ['expiresAt', Date.now() + 300000]
            ]);

            await this.workingMemory.store(message, metadata);
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
