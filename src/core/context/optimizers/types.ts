import { ConversationMessage } from '../types';

export interface IOptimizer {
    optimize(messages: ConversationMessage[]): Promise<ConversationMessage[]>;
    getName(): string;
    getMetadata(): { [key: string]: any };
}
