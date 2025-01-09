import { expect, test, describe, beforeEach, afterEach } from 'bun:test';
import { AgentMemorySystem } from '../../src/core/memory/AgentMemorySystem';
import { IMemoryStorage, IMemoryIndex, IMemoryUnit, MemoryFilter, MemoryType } from '../../src/core/memory/types';
import crypto from 'crypto';

// Mock LLM response for testing
class MockLLM {
    async generate(prompt: string): Promise<string> {
        return "This is a mock LLM response";
    }
}

// Mock Memory Cache
class MockMemoryCache {
    private cache: Map<string, IMemoryUnit> = new Map();
    private maxSize: number;

    constructor(maxSize: number = 1000) {
        this.cache = new Map();
        this.maxSize = maxSize;
    }

    set(id: string, memory: IMemoryUnit): void {
        if (this.cache.size >= this.maxSize) {
            // Remove oldest entry
            const firstKey = this.cache.keys().next().value;
            if (firstKey) {
                this.cache.delete(firstKey);
            }
        }
        this.cache.set(id, memory);
    }

    get(id: string): IMemoryUnit | undefined {
        return this.cache.get(id);
    }

    clear(): void {
        this.cache.clear();
    }
}

// Mock Memory Storage
class MockMemoryStorage implements IMemoryStorage {
    private storage: Map<string, IMemoryUnit> = new Map();
    private cache: Map<string, IMemoryUnit> = new Map();

    constructor() {
        this.cache = new Map();
    }

    async store(memory: IMemoryUnit): Promise<void> {
        // Deep clone memory to prevent reference issues
        const clonedMemory = {
            ...memory,
            id: memory.id || crypto.randomUUID(),
            content: memory.content,
            metadata: memory.metadata instanceof Map ? 
                new Map(memory.metadata) : 
                new Map(Object.entries(memory.metadata || {})),
            timestamp: memory.timestamp || new Date(),
            accessCount: memory.accessCount || 0,
            lastAccessed: memory.lastAccessed || new Date()
        };
        
        // Ensure metadata type is set
        if (!clonedMemory.metadata.has('type')) {
            clonedMemory.metadata.set('type', MemoryType.WORKING);
        }
        
        this.storage.set(clonedMemory.id, clonedMemory);
        this.cache.set(clonedMemory.id, clonedMemory);
    }

    async retrieve(id: string): Promise<IMemoryUnit | null> {
        const cached = this.cache.get(id);
        if (cached) {
            cached.lastAccessed = new Date();
            return cached;
        }

        const memory = this.storage.get(id);
        if (!memory) {
            return null;
        }
        memory.lastAccessed = new Date();
        this.cache.set(id, memory);
        return memory;
    }

    async update(memory: IMemoryUnit): Promise<void> {
        if (!memory.id) {
            throw new Error('Cannot update memory without id');
        }
        memory.lastAccessed = new Date();
        await this.store(memory);
    }

    async delete(id: string): Promise<void> {
        this.storage.delete(id);
        this.cache.delete(id);
    }

    async batchStore(memories: IMemoryUnit[]): Promise<void> {
        for (const memory of memories) {
            await this.store(memory);
        }
    }

    async batchRetrieve(ids: string[]): Promise<IMemoryUnit[]> {
        const memories: IMemoryUnit[] = [];
        for (const id of ids) {
            const memory = await this.retrieve(id);
            if (memory) {
                memories.push(memory);
            }
        }
        return memories;
    }

    async clear(): Promise<void> {
        this.storage.clear();
        this.cache.clear();
    }

    async retrieveByFilter(filter: MemoryFilter): Promise<IMemoryUnit[]> {
        const memories = Array.from(this.storage.values());
        return memories.filter(memory => {
            // Check if memory is expired
            const expiresAt = memory.metadata.get('expiresAt');
            if (expiresAt && typeof expiresAt === 'string' && parseInt(expiresAt) < Date.now()) {
                return false;
            }

            // Check memory type
            if (filter.types && filter.types.length > 0) {
                const memoryType = memory.metadata.get('type');
                if (!memoryType || !filter.types.includes(memoryType)) {
                    return false;
                }
            }

            // Check metadata filters
            if (filter.metadataFilters && filter.metadataFilters.length > 0) {
                return filter.metadataFilters.every(filterMap => {
                    return Array.from(filterMap.entries()).every(([key, value]) => {
                        if (key === 'expiresAt') return true; // Skip expiresAt check in metadata filters
                        return memory.metadata.get(key) === value;
                    });
                });
            }

            return true;
        });
    }
}

// Mock Memory Index
class MockMemoryIndex implements IMemoryIndex {
    private indexMap: Map<string, Set<string>> = new Map();
    private cache: MockMemoryCache;
    private storage: MockMemoryStorage;

    constructor(storage: MockMemoryStorage) {
        this.cache = new MockMemoryCache();
        this.storage = storage;
    }

    async add(memory: IMemoryUnit): Promise<void> {
        await this.index(memory);
    }

    async index(memory: IMemoryUnit): Promise<void> {
        if (!memory.id) {
            throw new Error('Cannot index memory without id');
        }

        // Index by memory type
        const typeKey = `type:${memory.metadata.get('type')}`;
        if (!this.indexMap.has(typeKey)) {
            this.indexMap.set(typeKey, new Set());
        }
        this.indexMap.get(typeKey)?.add(memory.id);

        // Index by metadata
        for (const [key, value] of memory.metadata.entries()) {
            const metaKey = `meta:${key}:${value}`;
            if (!this.indexMap.has(metaKey)) {
                this.indexMap.set(metaKey, new Set());
            }
            this.indexMap.get(metaKey)?.add(memory.id);
        }

        this.cache.set(memory.id, memory);
    }

    async update(memory: IMemoryUnit): Promise<void> {
        await this.remove(memory.id);
        await this.add(memory);
    }

    async remove(id: string): Promise<void> {
        // Remove from all indexes
        for (const [_, ids] of this.indexMap.entries()) {
            ids.delete(id);
        }
        this.cache.clear();
    }

    async search(query: string): Promise<string[]> {
        // Simple implementation that returns all memories of the queried type
        const typeMatch = query.match(/type:(\w+)/);
        if (typeMatch) {
            const typeKey = `type:${typeMatch[1]}`;
            return Array.from(this.indexMap.get(typeKey) || []);
        }
        return [];
    }

    async batchIndex(memories: IMemoryUnit[]): Promise<void> {
        await Promise.all(memories.map(memory => this.index(memory)));
    }

    async clear(): Promise<void> {
        this.indexMap.clear();
        this.cache.clear();
    }
}

describe('AgentMemorySystem', () => {
    let memorySystem: AgentMemorySystem;
    let storage: MockMemoryStorage;
    let index: MockMemoryIndex;
    const mockLLM = new MockLLM();

    beforeEach(() => {
        storage = new MockMemoryStorage();
        index = new MockMemoryIndex(storage);
        // Using a shorter consolidation interval for testing
        memorySystem = new AgentMemorySystem(storage, index, 1000);
    });

    afterEach(async () => {
        await storage.clear();
        await index.clear();
        if (memorySystem) {
            memorySystem.stopAllTimers();
        }
    });

    describe('Memory Storage Tests', () => {
        test('should store and retrieve working memory', async () => {
            const content = 'Test working memory';
            const metadata = new Map<string, string>([
                ['type', MemoryType.WORKING],
                ['tag', 'test']
            ]);

            await memorySystem.storeWorkingMemory(content, metadata);

            const filter: MemoryFilter = {
                types: [MemoryType.WORKING],
                metadataFilters: [new Map([['tag', 'test']])]
            };

            const memories = await memorySystem.retrieveWorkingMemories(filter);
            expect(memories.length).toBe(1);
            expect(memories[0].content).toBe(content);
        });

        test('should store and retrieve episodic memory', async () => {
            const content = 'Test episodic memory';
            const metadata = new Map<string, string>([
                ['type', MemoryType.EPISODIC],
                ['tag', 'test']
            ]);

            await memorySystem.storeEpisodicMemory(content, metadata);

            const filter: MemoryFilter = {
                types: [MemoryType.EPISODIC],
                metadataFilters: [new Map([['tag', 'test']])]
            };

            const memories = await memorySystem.retrieveEpisodicMemories(filter);
            expect(memories.length).toBe(1);
            expect(memories[0].content).toBe(content);
        });

        test('should consolidate working memory to episodic', async () => {
            const content = 'Memory to consolidate';
            const metadata = new Map<string, string>([
                ['type', MemoryType.WORKING],
                ['tag', 'consolidate']
            ]);

            await memorySystem.storeWorkingMemory(content, metadata);
            await memorySystem.getTransitionManager().checkAndTransition();

            const workingFilter: MemoryFilter = {
                types: [MemoryType.WORKING],
                metadataFilters: [new Map([['tag', 'consolidate']])]
            };

            const episodicFilter: MemoryFilter = {
                types: [MemoryType.EPISODIC],
                metadataFilters: [new Map([['tag', 'consolidate']])]
            };

            const workingMemories = await memorySystem.retrieveWorkingMemories(workingFilter);
            const episodicMemories = await memorySystem.retrieveEpisodicMemories(episodicFilter);

            expect(workingMemories.length).toBe(0);
            expect(episodicMemories.length).toBe(1);
            expect(episodicMemories[0].content).toBe(content);
        });

        test('should handle cleanup timers', async () => {
            // Create test memory with expiration
            const content = 'Test memory';
            const metadata = new Map<string, string>([
                ['type', MemoryType.WORKING],
                ['expiresAt', (Date.now() - 1000).toString()]
            ]);

            await memorySystem.storeWorkingMemory(content, metadata);

            // Wait for cleanup
            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify working memory was consolidated
            const workingFilter = {
                types: [MemoryType.WORKING],
                metadataFilters: []
            };

            const workingMemories = await memorySystem.retrieveWorkingMemories(workingFilter);
            expect(workingMemories.length).toBe(0);
        });

        test('should handle memory expiration', async () => {
            const content = 'Test memory';
            const metadata = new Map<string, string>([
                ['type', MemoryType.WORKING],
                ['expiresAt', (Date.now() - 1000).toString()]
            ]);

            await memorySystem.storeWorkingMemory(content, metadata);

            const filter = {
                types: [MemoryType.WORKING],
                metadataFilters: []
            };

            const memories = await memorySystem.retrieveWorkingMemories(filter);
            expect(memories.length).toBe(0);
        });

        test('should preserve metadata during consolidation', async () => {
            // Store test memory with metadata
            const metadata = new Map<string, any>([
                ['type', 'test'],
                ['importance', 0.8]
            ]);
            await memorySystem.storeWorkingMemory('test content', metadata);

            // Trigger transition
            await memorySystem.getTransitionManager().checkAndTransition();

            // Verify metadata preserved
            const episodicMemories = await memorySystem.getEpisodicMemory().retrieve({});
            expect(episodicMemories).toHaveLength(1);
            expect(episodicMemories[0].metadata.get('type')).toBe('test');
            expect(episodicMemories[0].metadata.get('importance')).toBe(0.8);
        });

        test('should handle memory consolidation with context', async () => {
            // Store test memory with context
            const metadata = new Map<string, any>([
                ['context', 'test-context'],
                ['priority', 1]
            ]);
            await memorySystem.storeWorkingMemory('test content', metadata);

            // Trigger transition
            await memorySystem.getTransitionManager().checkAndTransition();

            // Verify consolidation with context
            const episodicMemories = await memorySystem.getEpisodicMemory().retrieve({});
            expect(episodicMemories).toHaveLength(1);
            expect(episodicMemories[0].metadata.get('context')).toBe('test-context');
            expect(episodicMemories[0].metadata.get('priority')).toBe(1);
        });
    });

    describe('Context Management Tests', () => {
        test('should manage context effectively', async () => {
            await memorySystem.setContext('currentOperation', 'testing');
            const context = await memorySystem.getContext('currentOperation');
            expect(context).toBe('testing');
        });

        test('should clear context properly', async () => {
            await memorySystem.setContext('testKey', 'testValue');
            await memorySystem.clearContext();
            const context = await memorySystem.getContext('testKey');
            expect(context).toBeUndefined();
        });

        test('should load context based on filter', async () => {
            await memorySystem.setContext('testKey1', 'testValue1');
            await memorySystem.loadContext({
                metadataFilters: [new Map<string, any>([['contextSnapshot', true]])]
            });
            const allContext = await memorySystem.getAllContext();
            expect(allContext.size).toBeGreaterThan(0);
            expect(allContext.get('testKey1')).toBe('testValue1');
        });

        test('should handle memory and context interactions', async () => {
            const context = new Map<string, any>([
                ['currentOperation', 'testing'],
                ['operationType', 'integration'],
                ['memoryType', 'test']
            ]);
            await memorySystem.setContextBatch(context);
            const allContext = await memorySystem.getAllContext();
            expect(allContext.get('currentOperation')).toBe('testing');
            expect(allContext.get('operationType')).toBe('integration');
            expect(allContext.get('memoryType')).toBe('test');
        });
    });

    describe('Memory Transition', () => {
        test('should handle memory transitions correctly', async () => {
            // Store memory in working memory
            const content = 'test memory content';
            const memory = await memorySystem.storeWorkingMemory(content);

            // Verify it's in working memory
            let workingMemories = await memorySystem.getWorkingMemory().retrieve({});
            expect(workingMemories).toHaveLength(1);

            // Add high access count to trigger transition
            const metadata = new Map(workingMemories[0].metadata);
            metadata.set('accessCount', '5');
            await memorySystem.updateWorkingMemory({ ...workingMemories[0], metadata });

            // Trigger transition
            await memorySystem.getTransitionManager().checkAndTransition();

            // Verify memory moved to long-term memory
            workingMemories = await memorySystem.getWorkingMemory().retrieve({});
            expect(workingMemories).toHaveLength(0);

            const longTermMemories = await memorySystem.getLongTermMemory().retrieve({});
            expect(longTermMemories).toHaveLength(1);
        });

        test('should handle context-based transitions', async () => {
            // Store test memory with context switches
            const metadata = new Map<string, any>([
                ['context', 'test-context'],
                ['contextSwitches', '3']
            ]);
            await memorySystem.storeWorkingMemory('test content', metadata);

            // Trigger transition
            await memorySystem.getTransitionManager().checkAndTransition();

            // Verify memory moved to episodic memory
            const workingMemories = await memorySystem.getWorkingMemory().retrieve({});
            expect(workingMemories).toHaveLength(0);

            const episodicMemories = await memorySystem.getEpisodicMemory().retrieve({});
            expect(episodicMemories).toHaveLength(1);
        });
    });

    describe('Memory Consolidation', () => {
        test('should consolidate working memories to episodic memory', async () => {
            // Store test memory
            const content = 'test memory';
            const metadata = new Map<string, any>([
                ['type', 'test']
            ]);
            await memorySystem.storeWorkingMemory(content, metadata);

            // Trigger transition
            await memorySystem.getTransitionManager().checkAndTransition();

            // Verify memory moved to episodic
            const workingMemories = await memorySystem.getWorkingMemory().retrieve({});
            expect(workingMemories).toHaveLength(0);

            const episodicMemories = await memorySystem.getEpisodicMemory().retrieve({});
            expect(episodicMemories).toHaveLength(1);
            expect(episodicMemories[0].metadata.get('type')).toBe('test');
        });

        test('should preserve metadata during consolidation', async () => {
            // Store test memory with metadata
            const metadata = new Map<string, any>([
                ['type', 'test'],
                ['importance', 0.8]
            ]);
            await memorySystem.storeWorkingMemory('test content', metadata);

            // Trigger transition
            await memorySystem.getTransitionManager().checkAndTransition();

            // Verify metadata preserved
            const episodicMemories = await memorySystem.getEpisodicMemory().retrieve({});
            expect(episodicMemories).toHaveLength(1);
            expect(episodicMemories[0].metadata.get('type')).toBe('test');
            expect(episodicMemories[0].metadata.get('importance')).toBe(0.8);
        });
    });

    describe('Memory Cleanup', () => {
        test('should handle cleanup of expired memories', async () => {
            // Store test memory with short expiration
            const metadata = new Map<string, any>([
                ['type', 'test'],
                ['expiresAt', (Date.now() + 100).toString()] // 100ms expiration
            ]);
            await memorySystem.storeWorkingMemory('test content', metadata);

            // Wait for expiration
            await new Promise(resolve => setTimeout(resolve, 200));

            // Trigger cleanup via transition manager
            await memorySystem.getTransitionManager().checkAndTransition();

            // Verify memory was cleaned up
            const workingMemories = await memorySystem.getWorkingMemory().retrieve({});
            expect(workingMemories).toHaveLength(0);
        });

        test('should handle memory transitions with context', async () => {
            // Store test memory with context
            const metadata = new Map<string, any>([
                ['context', 'test-context'],
                ['contextSwitches', '3']
            ]);
            await memorySystem.storeWorkingMemory('test content', metadata);

            // Trigger transition
            await memorySystem.getTransitionManager().checkAndTransition();

            // Verify memory moved to episodic memory
            const workingMemories = await memorySystem.getWorkingMemory().retrieve({});
            expect(workingMemories).toHaveLength(0);

            const episodicMemories = await memorySystem.getEpisodicMemory().retrieve({});
            expect(episodicMemories).toHaveLength(1);
            expect(episodicMemories[0].metadata.get('context')).toBe('test-context');
        });
    });

    describe('Integration Tests', () => {
        test('should handle memory and context interactions', async () => {
            // Set initial context
            const contextData = new Map<string, any>([
                ['location', 'test-location'],
                ['activity', 'testing'],
                ['timestamp', Date.now().toString()]
            ]);
            await memorySystem.getContextManager().setContext('test', contextData);

            // Store memory with context
            const metadata = new Map<string, any>([
                ['context', 'test-context'],
                ['priority', '1'],
                ['timestamp', Date.now().toString()]
            ]);
            await memorySystem.storeWorkingMemory('test content', metadata);

            // Verify context association
            const memories = await memorySystem.getWorkingMemory().retrieve({});
            expect(memories).toHaveLength(1);
            expect(memories[0].metadata.get('context')).toBe('test-context');
            expect(memories[0].metadata.get('priority')).toBe('1');

            // Update context
            const newContextData = new Map<string, any>([
                ['location', 'new-location'],
                ['activity', 'updated-testing'],
                ['timestamp', Date.now().toString()]
            ]);
            await memorySystem.getContextManager().setContext('test', newContextData);

            // Verify context update reflected in memory
            const updatedMemories = await memorySystem.getWorkingMemory().retrieve({});
            expect(updatedMemories[0].metadata.get('context')).toBe('test-context');
        });

        test('should handle memory consolidation with context switches', async () => {
            // Store test memory with context switches
            const metadata = new Map<string, any>([
                ['context', 'test-context'],
                ['contextSwitches', '3'],
                ['timestamp', Date.now().toString()]
            ]);
            await memorySystem.storeWorkingMemory('test content', metadata);

            // Trigger transition
            await memorySystem.getTransitionManager().checkAndTransition();

            // Verify memory moved to episodic memory
            const workingMemories = await memorySystem.getWorkingMemory().retrieve({});
            expect(workingMemories).toHaveLength(0);

            const episodicMemories = await memorySystem.getEpisodicMemory().retrieve({});
            expect(episodicMemories).toHaveLength(1);
            expect(episodicMemories[0].metadata.get('context')).toBe('test-context');
        });
    });
});
