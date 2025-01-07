import { IContextMetric, ConversationMessage } from '../types';

/**
 * Metric for measuring message age
 */
export class AgeMetric implements IContextMetric {
    public threshold: number;

    constructor(maxAge: number = 24 * 60 * 60 * 1000) { // Default 24 hours
        this.threshold = maxAge;
    }

    public measure(messages: ConversationMessage[]): number {
        if (messages.length === 0) return 0;
        
        const now = new Date();
        const oldestMessage = messages.reduce((oldest, msg) => 
            msg.timestamp < oldest.timestamp ? msg : oldest
        , messages[0]);
        
        return now.getTime() - oldestMessage.timestamp.getTime();
    }
}
