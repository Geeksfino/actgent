import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryCache } from '../../../src/core/memory/AbstractMemory';
import { createTestMemory } from '../setup';

describe('MemoryCache', () => {
    let cache: MemoryCache;

    beforeEach(() => {
        cache = new MemoryCache();
        // @ts-ignore - Access private field for testing
        cache['maxSize'] = 2; // Set small cache size for testing
    });

    it('should store and retrieve memory units', () => {
        const memory = createTestMemory();
        cache.set(memory.id, memory);

        const retrieved = cache.get(memory.id);
        expect(retrieved).toEqual(memory);
    });

    it('should evict the least recently used entry when max size is exceeded', () => {
        const firstMemory = createTestMemory();
        const secondMemory = createTestMemory();
        const thirdMemory = createTestMemory();

        // Add first two items
        cache.set(firstMemory.id, firstMemory);
        cache.set(secondMemory.id, secondMemory);

        // Access first memory to make it most recently used
        cache.get(firstMemory.id);

        // Add third item, should evict second memory as it's least recently used
        cache.set(thirdMemory.id, thirdMemory);

        const retrievedFirst = cache.get(firstMemory.id);
        const retrievedSecond = cache.get(secondMemory.id);
        const retrievedThird = cache.get(thirdMemory.id);

        expect(retrievedFirst).toBeDefined();
        expect(retrievedSecond).toBeUndefined();
        expect(retrievedThird).toBeDefined();
    });

    it('should clear all entries', () => {
        const memory = createTestMemory();
        cache.set(memory.id, memory);

        cache.clear();
        const retrieved = cache.get(memory.id);
        expect(retrieved).toBeUndefined();
    });
});
