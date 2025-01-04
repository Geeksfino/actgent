import { Message } from './Message';
import { Session } from './Session';
import { MemoryStorage } from './Memory';
import { ShortTermMemory } from './ShortTermMemory';
import { LongTermMemory } from './LongTermMemory';
import { WorkingMemory } from './WorkingMemory';
import { logger } from './Logger';

export class MemoryManager {
  private shortTermMemory: ShortTermMemory;
  private longTermMemory: LongTermMemory;
  private workingMemory: WorkingMemory;
  private maxMemorySize: number;

  constructor(
    maxMemorySize: number,
    shortTermStorage: MemoryStorage<any>,
    longTermStorage: MemoryStorage<any>,
    workingMemoryStorage: MemoryStorage<any>
  ) {
    this.shortTermMemory = new ShortTermMemory(shortTermStorage);
    this.longTermMemory = new LongTermMemory(longTermStorage);
    this.workingMemory = new WorkingMemory(workingMemoryStorage);
    this.maxMemorySize = maxMemorySize;
  }

  getShortTermMemory(): ShortTermMemory {
    return this.shortTermMemory;
  }

  getLongTermMemory(): LongTermMemory {
    return this.longTermMemory;
  }

  getWorkingMemory(): WorkingMemory {
    return this.workingMemory;
  }

  async processMessage(message: Message, session: Session): Promise<void> {
    logger.warn(`adding message to memory: ${message.payload.input} from ${message.metadata?.sender}`);
    // Only store messages from user and assistant
    if (message.metadata?.sender === 'user' || message.metadata?.sender === 'assistant') {
      const key = `msg_${Date.now()}_${message.metadata?.sender}`;
      await this.shortTermMemory.add(key, message);
      
      // Add to working memory for active context
      await this.workingMemory.update([message]);
      
      // Optionally store in long-term memory based on importance
      if (this.shouldStoreInLongTerm(message)) {
        await this.longTermMemory.add(key, message);
      }
    }
  }

  async generateContext(session: Session): Promise<any> {
    const recentMessages = await this.shortTermMemory.getRecent(10);
    const workingMemoryItems = await this.workingMemory.getAll();
    const relevantLongTermMemories = await this.longTermMemory.search(session.description);

    return {
      recentMessages,
      workingMemory: workingMemoryItems,
      relevantLongTermMemories,
    };
  }

  async optimizeMemory(): Promise<void> {
    // Check memory usage and optimize if needed
    const totalSize = await this.getTotalMemorySize();
    if (totalSize > this.maxMemorySize) {
      logger.info(`Memory size ${totalSize} exceeds max ${this.maxMemorySize}, optimizing...`);
      // ShortTermMemory and WorkingMemory handle their own capacity
      // No need for manual optimization
    }
  }

  private async getTotalMemorySize(): Promise<number> {
    // Get total size of all memory components
    // This is a placeholder implementation
    return 0;
  }

  private async removeLeastImportantMemories(bytesToRemove: number): Promise<void> {
    // Implementation to remove least important memories
    // This is a placeholder and should be implemented based on your specific requirements
  }

  private extractRelevantInfo(message: Message): any[] {
    // Implementation to extract relevant information from the message
    // This is a placeholder and should be implemented based on your specific requirements
    return [];
  }

  private shouldStoreInLongTerm(message: Message): boolean {
    // Implementation to determine if a message should be stored in long-term memory
    // For now, we'll just store messages that might be important for future context
    return false;
  }
}