import { SessionContext } from "./SessionContext";
import { Message } from "./Message";
import { MemoryManager } from "./MemoryManager";

// Define interface for message records (moved from SessionContext)
export interface MessageRecord {
  role: "system" | "user" | "assistant";
  content: string;
  timestamp?: string;
}

// Define an interface for memory storage
export interface MemoryStorage<T> {
  add(key: string, value: T): Promise<void>;
  get(key: string): Promise<T | null>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

// Define an interface for agent memory
export interface Memory {
  processMessage(message: Message, sessionContext: SessionContext): Promise<void>;
  generateContext(sessionContext: SessionContext): Promise<any>;
  optimizeMemory(): Promise<void>;
  getRecentMessages(): Promise<Message[]>;
  getSystemContext(): Promise<Record<string, any>>;
  getConversationHistory(): Promise<Message[]>;
  getMessageRecords(limit?: number): Promise<MessageRecord[]>;  // New method
}

// Default implementation of AgentMemory
export class DefaultAgentMemory implements Memory {
  private memoryManager: MemoryManager;

  constructor(
    maxMemorySize: number,
    shortTermStorage: MemoryStorage<any>,
    longTermStorage: MemoryStorage<any>,
    workingMemoryStorage: MemoryStorage<any>
  ) {
    this.memoryManager = new MemoryManager(
      maxMemorySize,
      shortTermStorage,
      longTermStorage,
      workingMemoryStorage
    );
  }

  async processMessage(message: Message, sessionContext: SessionContext): Promise<void> {
    await this.memoryManager.processMessage(message, sessionContext.getSession());
  }

  async generateContext(sessionContext: SessionContext): Promise<any> {
    return this.memoryManager.generateContext(sessionContext.getSession());
  }

  async optimizeMemory(): Promise<void> {
    await this.memoryManager.optimizeMemory();
  }

  async getRecentMessages(): Promise<Message[]> {
    // Get recent messages from short-term memory
    const shortTermMemory = this.memoryManager.getShortTermMemory();
    return shortTermMemory.getRecent(10); // Get last 10 messages, adjust number as needed
  }

  async getSystemContext(): Promise<Record<string, any>> {
    // Get system context from working memory
    const workingMemory = this.memoryManager.getWorkingMemory();
    const systemContext = await workingMemory.getAll();
    return systemContext.reduce((acc, item) => {
      if (item.type === 'system_context') {
        return { ...acc, ...item.data };
      }
      return acc;
    }, {});
  }

  async getConversationHistory(): Promise<Message[]> {
    // Get conversation history from long-term memory
    const longTermMemory = this.memoryManager.getLongTermMemory();
    return longTermMemory.search('conversation_history');
  }

  async getMessageRecords(limit: number = 10): Promise<MessageRecord[]> {
    return this.memoryManager.getShortTermMemory().getMessageRecords(limit);
  }
}