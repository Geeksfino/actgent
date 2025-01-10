import { ConversationMessage, IHistoryManager, IContextOptimizer, IContextMetric } from '../../../src/core/context/types';
import { IOptimizer } from '../../../src/core/context/optimizers/types';
import crypto from 'crypto';

export class MockHistoryManager implements IHistoryManager {
    private messages: ConversationMessage[] = [];

    public addMessage(message: ConversationMessage): void {
        this.messages.push(message);
    }

    public async getContext(): Promise<string> {
        return this.messages.map(m => `${m.role}: ${m.content}`).join('\n');
    }

    public async optimize(): Promise<void> {
        // Mock implementation
    }

    public addInteractionFlow(): void {
        // Mock implementation
    }

    public async resolveReferences(): Promise<ConversationMessage[]> {
        return this.messages;
    }
}

export class MockContextOptimizer implements IOptimizer {
    private threshold: number;

    constructor(threshold: number = 0.5) {
        this.threshold = threshold;
    }

    getName(): string {
        return 'context';
    }

    getMetadata(): { [key: string]: any } {
        return { threshold: this.threshold };
    }

    async optimize(messages: ConversationMessage[]): Promise<ConversationMessage[]> {
        // Keep messages with relevance score above threshold
        return messages.filter(m => (m.metadata?.relevanceScore || 0) >= this.threshold);
    }
}

export class MockRelevanceOptimizer implements IOptimizer {
    getName(): string {
        return 'relevance';
    }

    getMetadata(): { [key: string]: any } {
        return {};
    }

    async optimize(messages: ConversationMessage[]): Promise<ConversationMessage[]> {
        // Keep only highly relevant messages
        return messages.filter(m => (m.metadata?.relevanceScore || 0) >= 0.7);
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
        timestamp: new Date(),
        relevanceScore,
        importance,
        tokens,
        metadata: {
            relevanceScore,
            importance,
            tokens
        }
    };
}
