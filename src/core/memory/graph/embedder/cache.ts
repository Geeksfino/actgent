import { IEmbeddingCache } from './types';

/**
 * LRU Cache implementation for embeddings
 */
export class EmbeddingCache implements IEmbeddingCache {
    private cache: Map<string, {
        embedding: number[];
        timestamp: number;
    }>;
    private hits: number = 0;
    private misses: number = 0;
    private maxSize: number;
    private ttl: number;

    constructor(maxSize: number = 10000, ttl: number = 24 * 60 * 60 * 1000) {
        this.cache = new Map();
        this.maxSize = maxSize;
        this.ttl = ttl;
    }

    private generateKey(text: string): string {
        if (!text) {
            throw new Error('Text cannot be empty');
        }
        // Simple hash function for cache keys
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(36);
    }

    private evictExpired(): void {
        const now = Date.now();
        for (const [key, value] of this.cache.entries()) {
            if (now - value.timestamp > this.ttl) {
                this.cache.delete(key);
            }
        }
    }

    private evictLRU(): void {
        if (this.cache.size >= this.maxSize) {
            // Remove oldest entry
            const firstKey = this.cache.keys().next().value;
            if (firstKey) {
                this.cache.delete(firstKey);
            }
        }
    }

    async get(text: string): Promise<number[] | undefined> {
        if (!text) {
            throw new Error('Text cannot be empty');
        }
        const key = this.generateKey(text);
        const entry = this.cache.get(key);
        
        if (!entry) {
            this.misses++;
            return undefined;
        }

        // Check if entry has expired
        if (Date.now() - entry.timestamp > this.ttl) {
            this.cache.delete(key);
            this.misses++;
            return undefined;
        }

        this.hits++;
        // Move to end to maintain LRU order
        this.cache.delete(key);
        this.cache.set(key, entry);
        return entry.embedding;
    }

    async set(text: string, embedding: number[]): Promise<void> {
        if (!text) {
            throw new Error('Text cannot be empty');
        }
        this.evictExpired();
        this.evictLRU();
        
        const key = this.generateKey(text);
        this.cache.set(key, {
            embedding,
            timestamp: Date.now()
        });
    }

    async has(text: string): Promise<boolean> {
        if (!text) {
            throw new Error('Text cannot be empty');
        }
        const key = this.generateKey(text);
        return this.cache.has(key);
    }

    async clear(): Promise<void> {
        this.cache.clear();
        this.hits = 0;
        this.misses = 0;
    }

    async stats(): Promise<{ size: number; hits: number; misses: number; }> {
        return {
            size: this.cache.size,
            hits: this.hits,
            misses: this.misses
        };
    }
}
