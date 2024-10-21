import { SessionContext } from "./SessionContext";
import { Message } from "./Message";
import { MemoryManager } from "./MemoryManager";

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
}

// MemoryManager and other components will be implemented in separate files