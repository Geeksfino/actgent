import { ConversationMessage } from './types';
import { SmartHistoryManager } from './SmartHistoryManager';
import { WorkingMemory } from '../memory/WorkingMemory';

/**
 * Enhanced context manager with smart history management
 */
export class ContextManager {
    private historyManager: SmartHistoryManager;
    private workingMemory: WorkingMemory;
    private context: Map<string, any>;

    constructor(workingMemory: WorkingMemory) {
        this.workingMemory = workingMemory;
        this.historyManager = new SmartHistoryManager(workingMemory);
        this.context = new Map();
    }

    public addMessage(message: ConversationMessage): void {
        this.historyManager.addMessage(message);
    }

    public async getContext(): Promise<Map<string, any>> {
        const historyContext = await this.historyManager.getContext();
        this.context.set('history', historyContext);
        return this.context;
    }

    public async optimize(): Promise<void> {
        await this.historyManager.optimize();
    }

    public setContext(key: string, value: any): void {
        this.context.set(key, value);
    }

    public getContextValue(key: string): any {
        return this.context.get(key);
    }

    public clearContext(): void {
        this.context.clear();
    }
}
