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

        // Consolidate memories
        await this.consolidateMemories(candidates);
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

    private async consolidateMemories(memories: IMemoryUnit[]): Promise<void> {
        // Group memories by type
        const groupedMemories = new Map<string, IMemoryUnit[]>();
        for (const memory of memories) {
            const type = memory.memoryType;
            if (!groupedMemories.has(type)) {
                groupedMemories.set(type, []);
            }
            groupedMemories.get(type)?.push(memory);
        }

        // Consolidate each group
        for (const [type, typeMemories] of groupedMemories) {
            await this.consolidateMemoryGroup(type, typeMemories);
        }
    }

    private async consolidateMemoryGroup(type: string, memories: IMemoryUnit[]): Promise<void> {
        if (memories.length < 2) return;

        try {
            // Calculate consolidation metrics
            const metrics = this.calculateConsolidationMetrics(memories);
            
            // Only proceed if relevance is high enough
            if ((metrics.relevance ?? 0) >= this.consolidationThreshold / 10) {
                // Create consolidated memory with metrics
                const consolidated = this.createConsolidatedMemory(memories);

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

    protected calculateConsolidationMetrics(memories: IMemoryUnit[]): ConsolidationMetrics {
        return {
            semanticSimilarity: this.calculateSemanticSimilarity(memories),
            contextualOverlap: this.calculateContextualOverlap(memories),
            temporalProximity: this.calculateTemporalProximity(memories),
            sourceReliability: this.calculateSourceReliability(memories),
            confidenceScore: this.calculateConfidenceScore(memories),
            accessCount: memories.reduce((acc, m) => acc + (m.consolidationMetrics?.accessCount || 0), 0),
            lastAccessed: new Date(),
            createdAt: new Date(),
            importance: this.calculateImportance(memories),
            relevance: this.calculateRelevance(memories)
        };
    }

    private calculateSemanticSimilarity(memories: IMemoryUnit[]): number {
        // TODO: Implement semantic similarity calculation
        return 0.5;
    }

    private calculateContextualOverlap(memories: IMemoryUnit[]): number {
        // TODO: Implement contextual overlap calculation
        return 0.5;
    }

    private calculateTemporalProximity(memories: IMemoryUnit[]): number {
        // TODO: Implement temporal proximity calculation
        return 0.5;
    }

    private calculateSourceReliability(memories: IMemoryUnit[]): number {
        // TODO: Implement source reliability calculation
        return 0.8;
    }

    private calculateConfidenceScore(memories: IMemoryUnit[]): number {
        // TODO: Implement confidence score calculation
        return 0.7;
    }

    private calculateImportance(memories: IMemoryUnit[]): number {
        // TODO: Implement importance calculation
        return memories.reduce((acc, m) => acc + (m.consolidationMetrics?.importance || 0), 0) / memories.length;
    }

    private calculateRelevance(memories: IMemoryUnit[]): number {
        // TODO: Implement relevance calculation
        return memories.reduce((acc, m) => acc + (m.consolidationMetrics?.relevance || 0), 0) / memories.length;
    }

    protected createConsolidatedMemory(memories: IMemoryUnit[]): IMemoryUnit {
        return {
            id: crypto.randomUUID(),
            content: this.mergeContents(memories),
            metadata: this.mergeMetadata(memories),
            timestamp: new Date(),
            memoryType: MemoryType.EPISODIC,
            priority: this.calculatePriority(memories),
            consolidationMetrics: this.calculateConsolidationMetrics(memories),
            associations: new Set(memories.map(m => m.id))
        };
    }

    private mergeContents(memories: IMemoryUnit[]): any {
        // Combine content from all memories
        const combinedContent = memories.reduce((acc, memory) => {
            if (typeof memory.content === 'object') {
                return { ...acc, ...memory.content };
            }
            return memory.content;
        }, {});

        return combinedContent;
    }

    private mergeMetadata(memories: IMemoryUnit[]): Map<string, any> {
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

        return combinedMetadata;
    }

    private calculatePriority(memories: IMemoryUnit[]): number {
        // Calculate priority based on average priority of memories
        return memories.reduce((acc, m) => acc + (m.priority || 0), 0) / memories.length;
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
