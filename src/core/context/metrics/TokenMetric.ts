import { IContextMetric, ConversationMessage } from '../types';
import { TokenCounter } from './TokenCounter';

/**
 * Metric for tracking token count in conversations
 */
export class TokenMetric implements IContextMetric {
    private tokenCounter: TokenCounter;
    public threshold: number;

    constructor(maxTokens: number = 4000) {
        this.tokenCounter = new TokenCounter();
        this.threshold = maxTokens;
    }

    public measure(messages: ConversationMessage[]): number {
        return messages.reduce((sum, msg) => sum + msg.tokens, 0);
    }

    /**
     * Count tokens in a text string
     */
    public count(text: string): number {
        return this.tokenCounter.count(text);
    }
}
