import { IMemoryUnit, MemoryType } from './types';
import { WorkingMemory } from './WorkingMemory';
import { EpisodicMemory } from './EpisodicMemory';
import { LongTermMemory } from './LongTermMemory';

export interface TransitionConfig {
    accessCountThreshold: number;      // Number of accesses before transition
    timeThresholdMs: number;          // Time in working memory before transition
    capacityThreshold: number;        // Working memory capacity threshold (0-1)
    importanceThreshold: number;      // Importance score threshold (0-1)
    contextSwitchThreshold: number;   // Number of context switches before transition
}

export class MemoryTransitionManager {
    private readonly config: TransitionConfig;
    
    constructor(
        private workingMemory: WorkingMemory,
        private episodicMemory: EpisodicMemory,
        private longTermMemory: LongTermMemory,
        config?: Partial<TransitionConfig>
    ) {
        this.config = {
            accessCountThreshold: 5,
            timeThresholdMs: 24 * 60 * 60 * 1000, // 24 hours
            capacityThreshold: 0.8,
            importanceThreshold: 0.7,
            contextSwitchThreshold: 3,
            ...config
        };
    }

    async checkAndTransition(): Promise<void> {
        await Promise.all([
            this.transitionByAccessCount(),
            this.transitionByTime(),
            this.transitionByCapacity(),
            this.transitionByImportance(),
            this.transitionByContextSwitches()
        ]);
    }

    private async transitionByAccessCount(): Promise<void> {
        const memories = await this.workingMemory.retrieve({
            types: [MemoryType.WORKING],
            metadataFilters: [
                new Map([['accessCount', { $gte: this.config.accessCountThreshold }]])
            ]
        });

        await this.transitionMemories(memories);
    }

    private async transitionByTime(): Promise<void> {
        const cutoffTime = Date.now() - this.config.timeThresholdMs;
        const memories = await this.workingMemory.retrieve({
            types: [MemoryType.WORKING],
            metadataFilters: [
                new Map([['timestamp', { $lte: cutoffTime }]])
            ]
        });

        await this.transitionMemories(memories);
    }

    private async transitionByCapacity(): Promise<void> {
        const stats = await this.workingMemory.getStats();
        if (stats.capacityUsage >= this.config.capacityThreshold) {
            // Get oldest memories based on timestamp
            const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // Start with memories older than 24h
            const memories = await this.workingMemory.retrieve({
                types: [MemoryType.WORKING],
                metadataFilters: [
                    new Map([['timestamp', { $lte: cutoffTime }]])
                ]
            });

            // If we don't have enough old memories, get the oldest ones based on count
            if (memories.length < Math.ceil(stats.totalMemories * 0.2)) {
                const allMemories = await this.workingMemory.retrieve({
                    types: [MemoryType.WORKING]
                });
                
                // Sort by timestamp and take oldest 20%
                allMemories.sort((a, b) => {
                    const aTime = a.metadata.get('timestamp') || 0;
                    const bTime = b.metadata.get('timestamp') || 0;
                    return aTime - bTime;
                });
                
                const targetCount = Math.ceil(stats.totalMemories * 0.2);
                memories.push(...allMemories.slice(0, targetCount - memories.length));
            }

            await this.transitionMemories(memories);
        }
    }

    private async transitionByImportance(): Promise<void> {
        const memories = await this.workingMemory.retrieve({
            types: [MemoryType.WORKING],
            metadataFilters: [
                new Map([['importance', { $gte: this.config.importanceThreshold }]])
            ]
        });

        await this.transitionMemories(memories);
    }

    private async transitionByContextSwitches(): Promise<void> {
        const memories = await this.workingMemory.retrieve({
            types: [MemoryType.WORKING],
            metadataFilters: [
                new Map([['contextSwitches', { $gte: this.config.contextSwitchThreshold }]])
            ]
        });

        await this.transitionMemories(memories);
    }

    private async transitionMemories(memories: IMemoryUnit[]): Promise<void> {
        for (const memory of memories) {
            const metadata = new Map(memory.metadata);
            metadata.set('originalType', MemoryType.WORKING);
            metadata.set('transitionTime', Date.now());
            
            // Determine target memory type based on content and metadata
            const targetType = this.determineTargetMemoryType(memory);
            metadata.set('type', targetType);

            // Store in appropriate memory system
            if (targetType === MemoryType.EPISODIC) {
                await this.episodicMemory.store(memory.content, metadata);
            } else {
                await this.longTermMemory.store(memory.content, metadata);
            }

            // Remove from working memory
            await this.workingMemory.delete(memory.id);
        }
    }

    private determineTargetMemoryType(memory: IMemoryUnit): MemoryType {
        const metadata = memory.metadata;
        
        // Check for temporal or spatial context indicators
        if (metadata.has('timeSequence') || metadata.has('location') || 
            metadata.has('contextSwitches')) {
            return MemoryType.EPISODIC;
        }
        
        // Check for semantic indicators
        if (metadata.has('concept') || metadata.has('relations') || 
            metadata.get('importance') >= this.config.importanceThreshold) {
            return MemoryType.SEMANTIC;
        }

        // Check for procedural indicators
        if (metadata.has('procedure') || metadata.has('steps') || 
            metadata.has('taskRelated')) {
            return MemoryType.PROCEDURAL;
        }

        // Default to semantic if no specific indicators
        return MemoryType.SEMANTIC;
    }
}
