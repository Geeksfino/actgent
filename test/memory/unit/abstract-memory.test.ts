import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AbstractMemory } from '../../../src/core/memory/AbstractMemory';
import { MemoryType, IMemoryUnit, MemoryFilter } from '../../../src/core/memory/types';
import { MockMemoryStorage, MockMemoryIndex, createTestMemory } from '../setup';
import { logger } from '../../../src/core/Logger';

// Concrete implementation for testing
class TestMemory extends AbstractMemory {
    constructor(storage: MockMemoryStorage, index: MockMemoryIndex) {
        super(storage, index, MemoryType.GENERIC);
    }

    // Implement abstract method
    async cleanup(): Promise<void> {
        // No-op for testing
    }

    // Add search method for testing
    async search(query: string): Promise<IMemoryUnit[]> {
        const ids = await this.index.search(query);
        if (ids.length === 0) {
            return [];
        }
        const filter: MemoryFilter = { ids };
        return this.retrieve(filter);
    }
}

describe('AbstractMemory', () => {
    let memory: TestMemory;
    let storage: MockMemoryStorage;
    let index: MockMemoryIndex;

    beforeEach(() => {
        storage = new MockMemoryStorage();
        index = new MockMemoryIndex();
        memory = new TestMemory(storage, index);
    });

    describe('Memory Operations', () => {
        it('should store memory with proper logging', async () => {
            const content = { test: 'data' };
            const metadata = new Map([['key', 'value']]);
            const logSpy = vi.spyOn(logger, 'debug');
            const stored = await memory.store(content, metadata);

            expect(stored).toBeDefined();
            expect(stored.content).toEqual(content);
            expect(stored.metadata).toEqual(metadata);
            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Storing memory unit'), expect.any(Object));
        });

        it('should retrieve memory and update access stats', async () => {
            const stored = await memory.store({ test: 'data' });
            const logSpy = vi.spyOn(logger, 'debug');
            
            const filter: MemoryFilter = { id: stored.id };
            const retrieved = await memory.retrieve(filter);
            
            expect(retrieved).toHaveLength(1);
            expect(retrieved[0].accessCount).toBe(1);
            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Retrieving memory unit'), expect.any(Object));
        });

        it('should handle cache hits and misses', async () => {
            const stored = await memory.store({ test: 'data' });
            const logSpy = vi.spyOn(logger, 'debug');

            // First retrieval - cache miss
            const filter: MemoryFilter = { id: stored.id };
            await memory.retrieve(filter);
            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Cache miss'), expect.any(Object));

            logSpy.mockClear();

            // Second retrieval - cache hit
            await memory.retrieve(filter);
            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Cache hit'), expect.any(Object));
        });

        it('should update memory with logging', async () => {
            const stored = await memory.store({ test: 'data' });
            const logSpy = vi.spyOn(logger, 'debug');

            const updated: IMemoryUnit = {
                ...stored,
                content: { test: 'updated' }
            };

            await memory.update(updated);
            const filter: MemoryFilter = { id: stored.id };
            const retrieved = await memory.retrieve(filter);
            
            expect(retrieved[0].content).toEqual({ test: 'updated' });
            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Updating memory unit'), expect.any(Object));
        });

        it('should delete memory with logging', async () => {
            const stored = await memory.store({ test: 'data' });
            const logSpy = vi.spyOn(logger, 'debug');

            await memory.delete(stored.id);
            const filter: MemoryFilter = { id: stored.id };
            const retrieved = await memory.retrieve(filter);
            
            expect(retrieved).toHaveLength(0);
            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Deleting memory unit'), expect.any(Object));
        });
    });

    describe('Performance Monitoring', () => {
        it('should track memory size and capacity', () => {
            const size = memory.getCurrentSize();
            const capacity = memory.getCapacity();

            expect(size).toBeDefined();
            expect(capacity).toBeDefined();
        });

        it('should handle batch operations efficiently', async () => {
            const ids = ['1', '2', '3'];
            const results = await memory.batchRetrieve(ids);

            expect(results).toHaveLength(3);
        });
    });

    describe('Error Handling', () => {
        it('should log errors during failed operations', async () => {
            const badId = 'non-existent';
            const logSpy = vi.spyOn(logger, 'error');
            await memory.delete(badId);

            expect(logSpy).toHaveBeenCalled();
        });

        it('should maintain cache consistency after errors', async () => {
            const badId = 'non-existent';
            await memory.delete(badId);

            const size = memory.getCurrentSize();
            expect(size).toBe(0);
        });
    });

    it('should store and retrieve memory units', async () => {
        const testUnit = createTestMemory();
        const stored = await memory.store(testUnit);
        
        const filter: MemoryFilter = { id: stored.id };
        const retrieved = await memory.retrieve(filter);
        expect(retrieved).toBeDefined();
        expect(retrieved.length).toBe(1);
        expect(retrieved[0].id).toBe(stored.id);
        expect(retrieved[0].content).toEqual(stored.content);
    });

    it('should update access count and timestamp on retrieval', async () => {
        const testUnit = createTestMemory();
        const initialTimestamp = testUnit.lastAccessed;
        const stored = await memory.store(testUnit);
        
        // Wait a bit to ensure timestamp changes
        await new Promise(resolve => setTimeout(resolve, 10));
        
        const filter: MemoryFilter = { id: stored.id };
        const retrieved = await memory.retrieve(filter);
        expect(retrieved.length).toBe(1);
        expect(retrieved[0].accessCount).toBe(1);
        expect(retrieved[0].lastAccessed!.getTime()).toBeGreaterThan(initialTimestamp!.getTime());
    });

    it('should delete memory units', async () => {
        const testUnit = createTestMemory();
        await memory.store(testUnit);
        await memory.delete(testUnit.id);
        
        const filter: MemoryFilter = { id: testUnit.id };
        const retrieved = await memory.retrieve(filter);
        expect(retrieved.length).toBe(0);
    });

    it('should handle non-existent memory units', async () => {
        const filter: MemoryFilter = { id: 'non-existent-id' };
        const retrieved = await memory.retrieve(filter);
        expect(retrieved.length).toBe(0);
    });

    it('should search memory units', async () => {
        const testUnit1 = createTestMemory();
        const testUnit2 = createTestMemory();
        await memory.store(testUnit1);
        await memory.store(testUnit2);
        
        const results = await memory.search('test');
        expect(results.length).toBeGreaterThan(0);
    });

    it('should log memory operations', async () => {
        const logSpy = vi.spyOn(logger, 'debug');
        const testUnit = createTestMemory();
        
        await memory.store(testUnit);
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Storing memory unit'), expect.any(Object));
        
        const filter: MemoryFilter = { id: testUnit.id };
        await memory.retrieve(filter);
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Retrieving memory unit'), expect.any(Object));
        
        await memory.delete(testUnit.id);
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Deleting memory unit'), expect.any(Object));
    });
});
