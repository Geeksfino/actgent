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
    MemoryContext,
    TransitionCriteria,
    IMemoryMetadata
} from './types';
import { logger } from '../Logger';
import crypto from 'crypto';

export class EpisodicMemory extends BaseMemorySystem {
    protected readonly MIN_IMPORTANCE_SCORE = 0.3;
    protected readonly MIN_EMOTIONAL_SIGNIFICANCE = 0.5;
    protected readonly MIN_RELATIONSHIP_DENSITY = 2;

    protected storage: IMemoryStorage;
    protected index: IMemoryIndex;

    constructor(storage: IMemoryStorage, index: IMemoryIndex) {
        super(storage, index);
        this.storage = storage;
        this.index = index;
        this.startCleanupTimer();
    }

    /**
     * Store episodic memory with enhanced metadata
     */
    public async store(content: any, metadata?: Map<string, any>): Promise<void> {
        const emotionalContext: EmotionalContext = metadata?.get('emotions') || {
            valence: 0,
            arousal: 0,
            dominance: 0,
            confidence: 0
        };

        const memoryContext: MemoryContext = metadata?.get('context') || {
            emotionalState: emotionalContext,
            topicHistory: [],
            userPreferences: new Map(),
            interactionPhase: 'introduction'
        };

        const episodicMemory: IEpisodicMemoryUnit = {
            id: metadata?.get('id') || crypto.randomUUID(),
            content: {
                timeSequence: Date.now(),
                location: metadata?.get('location') || 'unknown',
                actors: metadata?.get('actors') || [],
                actions: metadata?.get('actions') || [],
                emotions: emotionalContext,
                context: memoryContext,
                coherenceScore: metadata?.get('coherenceScore') || 0,
                timestamp: new Date(),
                relatedTo: metadata?.get('relatedTo') || []
            },
            metadata: metadata || new Map(),
            timestamp: new Date(),
            accessCount: 0,
            lastAccessed: new Date()
        };

        await this.storeWithType(episodicMemory.content, episodicMemory.metadata, MemoryType.EPISODIC);
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

    private calculateExperienceSimilarity(exp1: IEpisodicMemoryUnit, exp2: IEpisodicMemoryUnit): number {
        let similarityScore = 0;
        let totalWeight = 0;

        // Location similarity (20%)
        if (exp1.content.location === exp2.content.location) {
            similarityScore += 0.2;
        }
        totalWeight += 0.2;

        // Actor overlap (20%)
        const actorOverlap = this.calculateSetOverlap(
            new Set(exp1.content.actors),
            new Set(exp2.content.actors)
        );
        similarityScore += actorOverlap * 0.2;
        totalWeight += 0.2;

        // Action overlap (20%)
        const actionOverlap = this.calculateSetOverlap(
            new Set(exp1.content.actions),
            new Set(exp2.content.actions)
        );
        similarityScore += actionOverlap * 0.2;
        totalWeight += 0.2;

        // Emotional similarity (20%)
        if (exp1.content.emotions && exp2.content.emotions) {
            const emotionalSimilarity = this.calculateEmotionalOverlap(
                exp1.content.emotions,
                exp2.content.emotions
            );
            similarityScore += emotionalSimilarity * 0.2;
            totalWeight += 0.2;
        }

        // Temporal proximity (20%)
        const timeDiff = Math.abs(exp1.content.timeSequence - exp2.content.timeSequence);
        const maxTimeDiff = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
        const temporalSimilarity = Math.max(0, 1 - timeDiff / maxTimeDiff);
        similarityScore += temporalSimilarity * 0.2;
        totalWeight += 0.2;

        return totalWeight > 0 ? similarityScore / totalWeight : 0;
    }

    private calculateSetOverlap(set1: Set<string>, set2: Set<string>): number {
        if (set1.size === 0 && set2.size === 0) return 1;
        if (set1.size === 0 || set2.size === 0) return 0;

        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);

        return intersection.size / union.size;
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
        if (exp1.content.emotions?.getSize() && exp2.content.emotions?.getSize()) {
            const emotionalSimilarity = this.calculateEmotionalOverlap(
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
     * Calculate emotional overlap between two experiences
     */
    private calculateEmotionalOverlap(emotions1: EmotionalContext, emotions2: EmotionalContext): number {
        if (!emotions1?.emotions || !emotions2?.emotions) return 0;
        
        const set1 = new Set(emotions1.emotions.keys());
        const set2 = new Set(emotions2.emotions.keys());
        
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);
        
        // Calculate average intensity difference for overlapping emotions
        let totalDiff = 0;
        let count = 0;
        
        for (const emotion of intersection) {
            const intensity1 = emotions1.emotions.get(emotion) || 0;
            const intensity2 = emotions2.emotions.get(emotion) || 0;
            totalDiff += Math.abs(intensity1 - intensity2);
            count++;
        }
        
        const overlapScore = intersection.size / union.size;
        const intensityScore = count > 0 ? 1 - (totalDiff / count) : 0;
        
        return (overlapScore + intensityScore) / 2;
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
        if (content.emotions instanceof Object) {
            const emotionValues = Object.values(content.emotions) as number[];
            const maxEmotion = Math.max(...emotionValues);
            score += maxEmotion * 0.3;
        }

        return Math.min(1, score);
    }

    /**
     * Calculate emotional significance of a memory
     */
    private calculateEmotionalSignificance(emotions: EmotionalContext): number {
        if (!emotions?.emotions) return 0;
        
        const emotionsMap = emotions.emotions;
        if (emotions.getSize() === 0) return 0;
        
        // Calculate average emotional intensity
        let totalIntensity = 0;
        for (const intensity of emotionsMap.values()) {
            totalIntensity += intensity;
        }
        
        return totalIntensity / emotions.getSize();
    }

    /**
     * Check if memory should be consolidated with others
     */
    private async checkForConsolidation(content: IEpisodicMemoryUnit): Promise<void> {
        const allMemories = await this.retrieve({
            types: [MemoryType.EPISODIC]
        });

        const similarMemories = allMemories.filter(memory => {
            if (memory.metadata.get('consolidationStatus') === ConsolidationStatus.CONSOLIDATED) {
                return false;
            }
            const similarity = this.calculateSimilarityScore(content, memory);
            return similarity > 0.7;
        });

        if (similarMemories.length >= 3) {
            await this.consolidateMemories(similarMemories);
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

    public async update(memory: IMemoryUnit): Promise<void> {
        // Update access metrics
        memory.accessCount = (memory.accessCount || 0) + 1;
        memory.lastAccessed = new Date();

        // Recalculate emotional significance if emotions have changed
        const emotions = memory.content.emotions;
        if (emotions) {
            memory.metadata.set('emotionalSignificance', 
                this.calculateEmotionalSignificance(emotions));
        }

        await this.storage.update(memory);
        await this.index.update(memory);
    }

    public async delete(id: string): Promise<void> {
        await this.storage.delete(id);
        await this.index.remove(id);
    }

    public async performCleanup(): Promise<void> {
        return this.cleanup();
    }

    private calculateEmotionalSalience(memory: IMemoryUnit): number {
        const emotions = memory.metadata.get('emotions') as EmotionalContext;
        if (!emotions?.emotions) return 0;
        
        // Calculate average emotional intensity from the emotions map
        let totalIntensity = 0;
        for (const intensity of emotions.emotions.values()) {
            totalIntensity += intensity;
        }
        
        return emotions.getSize() > 0 ? totalIntensity / emotions.getSize() : 0;
    }
}
