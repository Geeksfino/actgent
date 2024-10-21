import { MemoryStorage } from "./Memory";

export class LongTermMemory {
  private storage: MemoryStorage<any>;

  constructor(storage: MemoryStorage<any>) {
    this.storage = storage;
  }

  async add(key: string, value: any): Promise<void> {
    await this.storage.add(key, value);
  }

  async get(key: string): Promise<any | null> {
    return this.storage.get(key);
  }

  async search(query: string): Promise<any[]> {
    // Search long-term memory based on relevance
    // This is a placeholder implementation
    return [];
  }
}