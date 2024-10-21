import { MemoryStorage } from './Memory';

export class ShortTermMemory {
  private storage: MemoryStorage<any>;
  private capacity: number;

  constructor(storage: MemoryStorage<any>, capacity: number = 100) {
    this.storage = storage;
    this.capacity = capacity;
  }

  async add(item: any): Promise<void> {
    const key = `stm_${Date.now()}`;
    await this.storage.add(key, item);
    // Remove oldest item if at capacity
    // This is a simplified implementation and should be improved for production use
  }

  async getRecent(n: number): Promise<any[]> {
    // Retrieve n most recent items
    // This is a placeholder implementation
    return [];
  }

  async getImportantItems(): Promise<any[]> {
    // Retrieve important items based on some criteria
    // This is a placeholder implementation
    return [];
  }

  async remove(items: any[]): Promise<void> {
    // Remove specified items from short-term memory
    // This is a placeholder implementation
  }
}