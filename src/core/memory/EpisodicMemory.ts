import { BaseMemorySystem } from './BaseMemorySystem';
import { EpisodicMemoryFactory } from './EpisodicMemoryFactory';
import { 
    IMemoryUnit, 
    IEpisodicMemoryUnit, 
    MemoryFilter, 
    IMemoryStorage, 
    IMemoryIndex, 
    MemoryType,
    ConsolidationStatus,
    EmotionalContext,
    IMemoryMetadata
} from './types';
import { logger } from '../Logger';

export class EpisodicMemory extends BaseMemorySystem {
    protected readonly MIN_IMPORTANCE_SCORE = 0.3;
    protected readonly MIN_EMOTIONAL_SIGNIFICANCE = 0.5;
    protected readonly MIN_RELATIONSHIP_DENSITY = 2;

    constructor(storage: IMemoryStorage, index: IMemoryIndex) {
        super(storage, index);
        this.startCleanupTimer();
    }

    /**
     * Store episodic memory with enhanced metadata
     */
    public async store(content: any, metadata: Map<string, any> = new Map()): Promise<void> {
        const metadataMap = new Map(metadata);
        metadataMap.set('type', MemoryType.EPISODIC);
        metadataMap.set('importanceScore', this.calculateImportanceScore(content));
        metadataMap.set('emotionalSignificance', this.calculateEmotionalSignificance(content.emotions));
        metadataMap.set('consolidationStatus', ConsolidationStatus.NEW);
        
        await this.storeWithType(content, metadataMap, MemoryType.EPISODIC);
        await this.checkForConsolidation(content);
    }

    /**
     * Retrieve episodic memories with enhanced filtering
     */
    public async retrieve(idOrFilter: string | MemoryFilter): Promise<IMemoryUnit[]> {
        if (typeof idOrFilter === 'string') {
            const memory = await this.storage.retrieve(idOrFilter);
            if (!memory || memory.metadata.get('type') !== MemoryType.EPISODIC) {
                return [];
            }
            const accessCount = (memory.metadata.get('accessCount') as number) || 0;
            memory.metadata.set('accessCount', accessCount + 1);
            memory.metadata.set('lastAccessed', new Date());
            await this.update(memory);
            return [memory];
        }

        return this.retrieveWithType(idOrFilter, MemoryType.EPISODIC);
    }

    /**
     * Find similar experiences with enhanced similarity scoring
     */
    public async findSimilarExperiences(memory: IEpisodicMemoryUnit): Promise<IEpisodicMemoryUnit[]> {
        const allMemories = await this.retrieve({ types: [MemoryType.EPISODIC] });
        
        logger.debug('Finding similar experiences for: %o', JSON.stringify(memory, null, 2));
        logger.debug('All memories: %o', JSON.stringify(allMemories, null, 2));
        
        // Ensure memory has required properties
        if (!memory?.content?.location || !memory?.content?.actors || !memory?.content?.actions) {
            logger.debug('Memory missing required properties');
            return [];
        }
        
        return allMemories.filter(existingMemory => {
            if (existingMemory.id === memory.id) {
                logger.debug('Skipping same memory');
                return false;
            }
            
            // Calculate similarity based on location, actors, and actions
            let similarityScore = 0;
            
            // Location similarity (40%)
            const locationMatch = existingMemory.content.location === memory.content.location;
            if (locationMatch) {
                similarityScore += 0.4;
                logger.debug('Location match: %s', existingMemory.content.location);
            }
            
            // Actor overlap (30%)
            const actorOverlap = memory.content.actors.filter(actor => 
                existingMemory.content.actors.includes(actor)
            ).length / Math.max(memory.content.actors.length, existingMemory.content.actors.length);
            similarityScore += 0.3 * actorOverlap;
            logger.debug('Actor overlap: %s', actorOverlap);
            
            // Action overlap (30%)
            const actionOverlap = this.calculateSetOverlap(
                new Set(memory.content.actions),
                new Set(existingMemory.content.actions)
            );
            similarityScore += 0.3 * actionOverlap;
            logger.debug('Action overlap: %s', actionOverlap);
            
            const hasCommonAction = memory.content.actions.some(action => 
                existingMemory.content.actions.includes(action)
            );
            
            logger.debug('Memory comparison: %o', {
                id: existingMemory.id,
                location: existingMemory.content.location,
                locationMatch,
                hasCommonAction,
                similarityScore
            });
            
            // Consider similar if either:
            // 1. Same location and at least one common action
            // 2. Overall similarity score > 0.3
            const isSimilar = (locationMatch && hasCommonAction) || similarityScore > 0.3;
            logger.debug('Is similar: %s', isSimilar);
            return isSimilar;
        });
    }

    /**
     * Calculate similarity score between two experiences
     */
    private calculateSimilarityScore(exp1: IEpisodicMemoryUnit, exp2: IEpisodicMemoryUnit): number {
        // Ensure both memories have content
        if (!exp1?.content || !exp2?.content) {
            return 0;
        }

        let score = 0;
        let weightSum = 0;

        // Location similarity (30%)
        if (exp1.content.location && exp2.content.location) {
            score += (exp1.content.location === exp2.content.location ? 0.3 : 0);
            weightSum += 0.3;
        }
        
        // Actor overlap (20%)
        if (exp1.content.actors?.length && exp2.content.actors?.length) {
            const actorOverlap = this.calculateSetOverlap(
                new Set(exp1.content.actors),
                new Set(exp2.content.actors)
            );
            score += actorOverlap * 0.2;
            weightSum += 0.2;
        }
        
        // Action overlap (20%)
        if (exp1.content.actions?.length && exp2.content.actions?.length) {
            const actionOverlap = this.calculateSetOverlap(
                new Set(exp1.content.actions.map(action => JSON.stringify(action))),
                new Set(exp2.content.actions.map(action => JSON.stringify(action)))
            );
            score += actionOverlap * 0.2;
            weightSum += 0.2;
        }
        
        // Emotional similarity (20%)
        if (exp1.content.emotions?.size && exp2.content.emotions?.size) {
            const emotionalSimilarity = this.calculateEmotionalSimilarity(
                exp1.content.emotions,
                exp2.content.emotions
            );
            score += emotionalSimilarity * 0.2;
            weightSum += 0.2;
        }

        // Temporal proximity (10%)
        if (exp1.content.timestamp && exp2.content.timestamp) {
            const temporalProximity = this.calculateTemporalProximity(
                exp1.content.timestamp,
                exp2.content.timestamp
            );
            score += temporalProximity * 0.1;
            weightSum += 0.1;
        }

        // Lower the similarity threshold and normalize scores
        const finalScore = weightSum === 0 ? 0 : score / weightSum;
        return finalScore; // Remove minimum threshold check
    }

    /**
     * Calculate set overlap for similarity scoring
     */
    private calculateSetOverlap(set1: Set<string>, set2: Set<string>): number {
        if (!set1.size || !set2.size) return 0;
        
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);
        
        return intersection.size / union.size;
    }

    /**
     * Calculate emotional similarity between two experiences
     */
    private calculateEmotionalSimilarity(emotions1?: Map<string, number>, emotions2?: Map<string, number>): number {
        if (!emotions1 || !emotions2) return 0;

        const allEmotions = new Set([...emotions1.keys(), ...emotions2.keys()]);
        let totalDiff = 0;
        let count = 0;

        for (const emotion of allEmotions) {
            const val1 = emotions1.get(emotion) || 0;
            const val2 = emotions2.get(emotion) || 0;
            totalDiff += Math.abs(val1 - val2);
            count++;
        }

        return count > 0 ? 1 - (totalDiff / count) : 0;
    }

    /**
     * Calculate temporal proximity between two timestamps
     */
    private calculateTemporalProximity(time1: Date, time2: Date): number {
        if (!time1 || !time2) return 0;
        const diff = Math.abs(time1.getTime() - time2.getTime());
        const DAY = 24 * 60 * 60 * 1000;
        return Math.max(0, 1 - diff / (7 * DAY)); // Full score if within same day, decreasing over a week
    }

    /**
     * Calculate importance score for a memory
     */
    private calculateImportanceScore(content: any): number {
        let score = 0;

        // Base importance from content properties
        if (content.actors?.length) score += 0.2;
        if (content.actions?.length) score += 0.2;
        if (content.location) score += 0.1;
        if (content.emotions?.size) score += 0.2;

        // Additional importance from emotional intensity
        if (content.emotions instanceof Map) {
            const emotionValues = Array.from(content.emotions.values()) as number[];
            const maxEmotion = Math.max(...emotionValues);
            score += maxEmotion * 0.3;
        }

        return Math.min(1, score);
    }

    /**
     * Calculate emotional significance of a memory
     */
    private calculateEmotionalSignificance(emotions: Map<string, number>): number {
        if (!emotions) return 0;

        // Define emotion weights - negative emotions have higher weight for significance
        const emotionWeights = new Map<string, number>([
            ['happy', 0.8],
            ['excited', 0.8],
            ['sad', 1.2],
            ['angry', 1.2],
            ['afraid', 1.2],
            ['tired', 0.6],
            ['neutral', 0.5]
        ]);

        let totalSignificance = 0;
        let totalWeight = 0;

        for (const [emotion, intensity] of emotions.entries()) {
            const weight = emotionWeights.get(emotion.toLowerCase()) || 1.0;
            totalSignificance += intensity * weight;
            totalWeight += weight;
        }

        // Normalize the significance score to be between 0 and 1
        const normalizedSignificance = totalWeight > 0 ? 
            totalSignificance / totalWeight : 0;

        // Apply a sigmoid-like function to emphasize mid-to-high values
        return Math.tanh(normalizedSignificance * 1.5);
    }

    /**
     * Check if memory should be consolidated with others
     */
    private async checkForConsolidation(content: any): Promise<void> {
        const allMemories = await this.retrieve({
            types: [MemoryType.EPISODIC]
        });

        const similarMemories = allMemories.filter(memory => {
            if (memory.metadata.get('consolidationStatus') === ConsolidationStatus.CONSOLIDATED) {
                return false;
            }
            const similarity = this.calculateSimilarityScore(content, memory as IEpisodicMemoryUnit);
            return similarity > 0.7;
        });

        if (similarMemories.length >= 3) {
            await this.consolidateMemories(similarMemories as IEpisodicMemoryUnit[]);
        }
    }

    /**
     * Consolidate multiple similar memories into a higher-level memory
     */
    private async consolidateMemories(memories: IEpisodicMemoryUnit[]): Promise<void> {
        if (memories.length < 2) return;
        
        // Sort by importance score
        memories.sort((a, b) => 
            (b.metadata.get('importanceScore') as number) - 
            (a.metadata.get('importanceScore') as number)
        );
        
        // Use the most important memory as the base
        const baseMemory = memories[0];
        const baseMetadata = new Map(baseMemory.metadata);
        baseMetadata.set('consolidationStatus', ConsolidationStatus.CONSOLIDATED);
        baseMemory.metadata = baseMetadata;
        await this.update(baseMemory);
        
        // Mark others as consolidated and link to base memory
        for (let i = 1; i < memories.length; i++) {
            const memory = memories[i];
            const metadata = new Map(memory.metadata);
            metadata.set('consolidationStatus', ConsolidationStatus.CONSOLIDATED);
            metadata.set('consolidatedInto', baseMemory.id);
            memory.metadata = metadata;
            await this.update(memory);
        }
    }

    private getMostFrequent<T>(arr: T[]): T {
        const counts = new Map<T, number>();
        arr.forEach(item => counts.set(item, (counts.get(item) || 0) + 1));
        
        let maxCount = 0;
        let mostFrequent: T = arr[0];
        counts.forEach((count, item) => {
            if (count > maxCount) {
                maxCount = count;
                mostFrequent = item;
            }
        });
        
        return mostFrequent;
    }

    /**
     * Enhanced cleanup considering importance, emotional significance, and relationships
     */
    protected async cleanup(): Promise<void> {
        const allMemories = await this.retrieve({ types: [MemoryType.EPISODIC] });
        
        for (const memory of allMemories) {
            const importanceScore = memory.metadata.get('importanceScore') as number;
            const emotionalSignificance = memory.metadata.get('emotionalSignificance') as number;
            const accessCount = memory.metadata.get('accessCount') as number || 0;
            const consolidationStatus = memory.metadata.get('consolidationStatus');
            
            // Keep if:
            // 1. High importance or emotional significance
            // 2. Frequently accessed
            // 3. Is a consolidated memory (base memory)
            const shouldKeep = 
                importanceScore > this.MIN_IMPORTANCE_SCORE ||
                emotionalSignificance > this.MIN_EMOTIONAL_SIGNIFICANCE ||
                accessCount >= 3 ||
                consolidationStatus === ConsolidationStatus.CONSOLIDATED;
                
            if (!shouldKeep) {
                await this.delete(memory.id);
            }
        }
    }
}
