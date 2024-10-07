import { MemoryStorage } from './Memory';

export class InMemoryStorage<T> implements MemoryStorage<T> {
  private storage: Map<string, T> = new Map();

  async add(key: string, value: T): Promise<void> {
    this.storage.set(key, value);
  }

  async get(key: string): Promise<T | null> {
    return this.storage.get(key) || null;
  }

  async delete(key: string): Promise<void> {
    this.storage.delete(key);
  }

  async clear(): Promise<void> {
    this.storage.clear();
  }

  // Additional method to get all keys (useful for debugging and management)
  async getAllKeys(): Promise<string[]> {
    return Array.from(this.storage.keys());
  }

  // Additional method to get the size of the storage
  async getSize(): Promise<number> {
    return this.storage.size;
  }
}