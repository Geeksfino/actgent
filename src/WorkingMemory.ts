import { MemoryStorage } from './Memory';

export class WorkingMemory {
  private storage: MemoryStorage<any>;
  private capacity: number;

  constructor(storage: MemoryStorage<any>, capacity: number = 10) {
    this.storage = storage;
    this.capacity = capacity;
  }

  async update(items: any[]): Promise<void> {
    // Update working memory with new items
    // This is a simplified implementation and should be improved for production use
    for (const item of items) {
      await this.storage.add(`wm_${Date.now()}`, item);
    }
    // Remove oldest items if over capacity
  }

  async clear(): Promise<void> {
    await this.storage.clear();
  }

  async getAll(): Promise<any[]> {
    // Retrieve all items in working memory
    // This is a placeholder implementation
    return [];
  }
}