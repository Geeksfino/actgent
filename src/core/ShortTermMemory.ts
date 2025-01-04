import { MemoryStorage } from "./Memory";
import { Message } from "./Message";
import { MessageRecord } from "./Memory";
import { logger } from "./Logger";

export class ShortTermMemory {
  private storage: MemoryStorage<any>;
  private messageKeys: string[] = [];
  private capacity: number;

  constructor(storage: MemoryStorage<any>, capacity: number = 100) {
    this.storage = storage;
    this.capacity = capacity;
  }

  async add(key: string, value: any): Promise<void> {
    await this.storage.add(key, value);
    this.messageKeys.push(key);

    // Maintain capacity
    if (this.messageKeys.length > this.capacity) {
      const oldestKey = this.messageKeys.shift();
      if (oldestKey) {
        await this.storage.delete(oldestKey);
      }
    }
  }

  async get(key: string): Promise<any | null> {
    return this.storage.get(key);
  }

  async getRecent(limit: number = 10): Promise<Message[]> {
    const messages: Message[] = [];
    const keys = this.messageKeys.slice(-limit);
    
    for (const key of keys) {
      const message = await this.storage.get(key);
      if (message) {
        messages.push(message);
      }
    }

    return messages;
  }

  private determineMessageRole(message: Message): "system" | "user" | "assistant" {
    if (message.metadata?.sender === 'user') {
      return 'user';
    } else if (message.metadata?.sender === 'assistant') {
      return 'assistant';
    }
    return 'system';
  }

  async getMessageRecords(limit: number = 10): Promise<MessageRecord[]> {
    const messages = await this.getRecent(limit);
    return messages
      .filter(msg => msg.metadata?.sender === 'user' || msg.metadata?.sender === 'assistant')
      .map(message => ({
        role: this.determineMessageRole(message),
        content: message.payload.input,
        timestamp: message.metadata?.timestamp
      }));
  }
}