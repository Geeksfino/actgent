import { ConversationMessage, IHistoryManager, IContextOptimizer, IContextMetric } from '../../../src/core/context/types';

export class MockHistoryManager implements IHistoryManager {
    private messages: ConversationMessage[] = [];

    async addMessage(message: ConversationMessage): Promise<void> {
        this.messages.push(message);
    }

    async getContext(): Promise<string> {
        return this.messages.map(m => m.content).join('\n');
    }

    async optimize(): Promise<void> {
        // Mock optimization
    }

    getMessages(): ConversationMessage[] {
        return [...this.messages];
    }
}

export class MockContextOptimizer implements IContextOptimizer {
    private threshold: number;

    constructor(threshold: number = 0.5) {
        this.threshold = threshold;
    }

    shouldOptimize(metrics: any): boolean {
        return metrics.messageCount > 5 || metrics.tokenCount > 100;
    }

    async optimize(messages: ConversationMessage[]): Promise<ConversationMessage[]> {
        // Keep messages with relevance score above threshold
        return messages.filter(m => m.relevanceScore >= this.threshold);
    }
}

export class MockRelevanceOptimizer implements IContextOptimizer {
    shouldOptimize(metrics: any): boolean {
        return metrics.averageRelevance < 0.7;
    }

    async optimize(messages: ConversationMessage[]): Promise<ConversationMessage[]> {
        // Keep only highly relevant messages
        return messages.filter(m => m.relevanceScore >= 0.7);
    }
}

export class MockTokenOptimizer implements IContextOptimizer {
    private tokenLimit: number;

    constructor(tokenLimit: number = 100) {
        this.tokenLimit = tokenLimit;
    }

    shouldOptimize(metrics: any): boolean {
        return metrics.tokenCount > this.tokenLimit;
    }

    async optimize(messages: ConversationMessage[]): Promise<ConversationMessage[]> {
        let totalTokens = 0;
        return messages.filter(m => {
            if (totalTokens + m.tokens <= this.tokenLimit) {
                totalTokens += m.tokens;
                return true;
            }
            return false;
        });
    }
}

export class MockContextMetric implements IContextMetric {
    constructor(private value: number = 0, public threshold: number = 100) {}

    measure(messages: ConversationMessage[]): number {
        return this.value;
    }
}

export function createTestMessage(
    content: string,
    role: string = 'user',
    relevanceScore: number = 1.0,
    importance: number = 1.0,
    tokens: number = 10
): ConversationMessage {
    return {
        id: crypto.randomUUID(),
        content,
        role,
        timestamp: new Date('2025-01-07T22:26:33+08:00'),
        relevanceScore,
        importance,
        tokens
    };
}
