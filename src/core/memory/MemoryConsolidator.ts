import { 
    IMemoryUnit, 
    IMemoryConsolidation, 
    ConsolidationStatus, 
    IMemoryStorage, 
    IMemoryIndex,
    MemoryType,
    MemoryFilter,
    ConsolidationMetrics
} from './types';
import crypto from 'crypto';

export interface ConsolidationTrigger {
    type: 'access_count' | 'time_based' | 'priority_change' | 'context_switch' | 'memory_capacity';
    threshold: number;
    lastCheck?: number;
}

export class MemoryConsolidator implements IMemoryConsolidation {
    private storage: IMemoryStorage;
    private index: IMemoryIndex;
    private triggers: Map<string, ConsolidationTrigger>;
    private maxWorkingMemorySize: number;
    private currentWorkingMemorySize: number = 0;
    private consolidationThreshold: number;
    private nlpService?: any; // NLP service for semantic similarity calculation

    constructor(
        storage: IMemoryStorage,
        index: IMemoryIndex,
        maxWorkingMemorySize: number = 1000,
        triggers?: Map<string, ConsolidationTrigger>,
        consolidationThreshold: number = 5,
        nlpService?: any
    ) {
        this.storage = storage;
        this.index = index;
        this.maxWorkingMemorySize = maxWorkingMemorySize;
        this.consolidationThreshold = consolidationThreshold;
        this.nlpService = nlpService;
        
        // Default consolidation triggers
        this.triggers = triggers || new Map([
            ['access_count', { type: 'access_count', threshold: 5 }],
            ['time_based', { type: 'time_based', threshold: 24 * 60 * 60 * 1000 }], // 24 hours
            ['priority_change', { type: 'priority_change', threshold: 0.8 }],
            ['context_switch', { type: 'context_switch', threshold: 3 }],
            ['memory_capacity', { type: 'memory_capacity', threshold: 0.8 }]
        ]);
    }

    async consolidate(memory: IMemoryUnit): Promise<void> {
        // Get memories to consolidate
        const candidates = await this.getConsolidationCandidates();
        if (candidates.length === 0) return;

        // Group similar memories
        const groups = await this.groupSimilarMemories(candidates);

        // Consolidate each group
        for (const group of groups) {
            await this.consolidateGroup(group);
        }
    }

    async getConsolidationCandidates(): Promise<IMemoryUnit[]> {
        const filter: MemoryFilter = {
            types: [MemoryType.WORKING],
            metadataFilters: []
        };

        const memories = await this.storage.retrieveByFilter(filter);
        return memories.filter(memory => {
            const metrics = memory.consolidationMetrics;
            if (!metrics) return false;

            const accessCount = metrics.accessCount || 0;
            const lastAccessed = metrics.lastAccessed?.getTime() || memory.timestamp.getTime();
            const age = Date.now() - lastAccessed;

            // Optimize memories with low access counts and old age
            if (accessCount < 5 && age > 24 * 60 * 60 * 1000) {  // 24 hours
                memory.metadata.set('optimized', true);
                return true;
            }

            // Don't optimize frequently accessed memories
            if (accessCount >= 10) {
                memory.metadata.set('optimized', false);
                return false;
            }

            return false;
        });
    }

    private async groupSimilarMemories(memories: IMemoryUnit[]): Promise<IMemoryUnit[][]> {
        const groups: IMemoryUnit[][] = [];
        const processed = new Set<string>();

        for (const memory of memories) {
            if (processed.has(memory.id)) continue;

            const similar = await this.findSimilarMemories(memory);
            if (similar.length > 0) {
                groups.push([memory, ...similar]);
                processed.add(memory.id);
                similar.forEach(m => processed.add(m.id));
            }
        }

        return groups;
    }

    private async findSimilarMemories(memory: IMemoryUnit): Promise<IMemoryUnit[]> {
        // Get related memory IDs from the index
        const relatedIds = await this.index.search(JSON.stringify(memory.content));
        
        // Filter out the current memory ID
        const otherIds = relatedIds.filter(id => id !== memory.id);
        
        // Retrieve all related memories
        const memories = await this.storage.batchRetrieve(otherIds);
        
        // Filter out null values and return valid memories
        return memories.filter((m): m is IMemoryUnit => m !== null);
    }

    private async calculateConsolidationMetrics(memories: IMemoryUnit[]): Promise<ConsolidationMetrics> {
        const metrics: ConsolidationMetrics = {
            accessCount: 0,
            lastAccessed: new Date(),
            createdAt: new Date(),
            importance: 0,
            relevance: 0
        };
        
        try {
            // Calculate temporal proximity (0-1 score based on time difference)
            const timestamps = memories.map(m => m.timestamp.getTime());
            const timeRange = Math.max(...timestamps) - Math.min(...timestamps);
            const temporalProximity = Math.exp(-timeRange / (24 * 60 * 60 * 1000)); // Decay over 24 hours

            // Calculate source reliability (based on memory metadata)
            const sourceReliability = memories.reduce((acc, m) => {
                const reliability = m.metadata.get('sourceReliability') || 0.5;
                return acc + reliability;
            }, 0) / memories.length;

            // Calculate semantic similarity if NLP service is available
            let semanticSimilarity = 0;
            if (this.nlpService) {
                const contents = memories.map(m => JSON.stringify(m.content));
                const similarities = await Promise.all(
                    contents.map(async (c1, i) => {
                        const scores = await Promise.all(
                            contents.map(async (c2, j) => {
                                if (i === j) return 1;
                                return await this.nlpService.calculateSimilarity(c1, c2);
                            })
                        );
                        return scores.reduce((a, b) => a + b, 0) / scores.length;
                    })
                );
                semanticSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;
            }

            // Calculate importance based on access patterns and age
            metrics.accessCount = memories.reduce((acc, m) => acc + (m.consolidationMetrics?.accessCount || 0), 0);
            metrics.lastAccessed = new Date(Math.max(...memories.map(m => m.consolidationMetrics?.lastAccessed?.getTime() || 0)));
            metrics.createdAt = new Date(Math.min(...memories.map(m => m.consolidationMetrics?.createdAt?.getTime() || Date.now())));

            // Calculate importance and relevance
            metrics.importance = memories.reduce((acc, m) => acc + (m.priority || 0), 0) / memories.length;
            metrics.relevance = (temporalProximity + sourceReliability + semanticSimilarity) / 3;

        } catch (error) {
            console.error('Error calculating consolidation metrics:', error);
            // Provide default metrics on error
            metrics.importance = 0.5;
            metrics.relevance = 0.5;
        }

        return metrics;
    }

    private async consolidateGroup(memories: IMemoryUnit[]): Promise<void> {
        if (memories.length < 2) return;

        try {
            // Calculate consolidation metrics
            const metrics = await this.calculateConsolidationMetrics(memories);
            
            // Only proceed if relevance is high enough
            if ((metrics.relevance ?? 0) >= this.consolidationThreshold / 10) {
                // Create consolidated memory with metrics
                const consolidated = await this.createConsolidatedMemory(memories, metrics);

                // Store the consolidated memory
                await this.storage.store(consolidated);

                // Update indices and clean up old memories
                await Promise.all([
                    this.index.add(consolidated),
                    ...memories.map(m => this.storage.delete(m.id))
                ]);

                // Update working memory size
                await this.updateWorkingMemorySize(-memories.length + 1);
            }
        } catch (error) {
            console.error('Error during group consolidation:', error);
        }
    }

    private async createConsolidatedMemory(memories: IMemoryUnit[], metrics: ConsolidationMetrics): Promise<IMemoryUnit> {
        // Combine content from all memories
        const combinedContent = memories.reduce((acc, memory) => {
            if (typeof memory.content === 'object') {
                return { ...acc, ...memory.content };
            }
            return memory.content;
        }, {});

        // Combine metadata from all memories
        const combinedMetadata = new Map<string, any>();
        memories.forEach(memory => {
            memory.metadata.forEach((value, key) => {
                if (!combinedMetadata.has(key)) {
                    combinedMetadata.set(key, value);
                }
            });
        });

        // Preserve memory type from original memory
        const originalType = memories[0].metadata.get('type');
        if (originalType) {
            combinedMetadata.set('type', originalType);
        }

        // Set optimization flags
        const isOptimized = memories.some(m => m.metadata.get('optimized'));
        if (isOptimized) {
            combinedMetadata.set('optimized', true);
        }

        // Combine associations from all memories
        const associations = new Set<string>();
        memories.forEach(memory => {
            if (memory.associations) {
                memory.associations.forEach(id => associations.add(id));
            }
        });

        // Create new consolidated memory
        return {
            id: crypto.randomUUID(),
            content: combinedContent,
            metadata: combinedMetadata,
            timestamp: new Date(),
            priority: memories.reduce((acc, m) => acc + (m.priority || 0), 0) / memories.length,
            consolidationMetrics: metrics,
            associations
        };
    }

    public isConsolidationNeeded(memory: IMemoryUnit): boolean {
        return Array.from(this.triggers.values()).some(trigger => 
            this.checkTriggerCondition(memory, trigger)
        );
    }

    private checkTriggerCondition(memory: IMemoryUnit, trigger: ConsolidationTrigger): boolean {
        switch (trigger.type) {
            case 'access_count':
                return (memory.consolidationMetrics?.accessCount || 0) >= trigger.threshold;
            case 'time_based':
                return Date.now() - memory.timestamp.getTime() >= trigger.threshold;
            case 'priority_change':
                return (memory.priority || 0) >= trigger.threshold;
            case 'context_switch':
                return (memory.metadata.get('contextSwitches') || 0) >= trigger.threshold;
            case 'memory_capacity':
                return (this.currentWorkingMemorySize / this.maxWorkingMemorySize) >= trigger.threshold;
            default:
                return false;
        }
    }

    public async updateWorkingMemorySize(delta: number): Promise<void> {
        this.currentWorkingMemorySize += delta;
        if (this.currentWorkingMemorySize < 0) {
            this.currentWorkingMemorySize = 0;
        }
    }
}
