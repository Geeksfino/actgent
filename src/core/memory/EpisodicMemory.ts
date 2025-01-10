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

class EmotionalContextImpl implements EmotionalContext {
    constructor(
        public emotions: Map<string, number>,
        public valence: number,
        public arousal: number,
        public dominance: number,
        public confidence: number
    ) {}

    public getSize(): number {
        return this.emotions.size;
    }
}

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
        metadata = metadata || new Map<string, any>();
        
        // Ensure we have basic metadata
        if (!metadata.has('type')) {
            metadata.set('type', MemoryType.EPISODIC);
        }

        // Convert emotions Map to EmotionalContext if needed
        if (content.emotions instanceof Map) {
            content.emotions = this.createEmotionalContext(content.emotions);
        }

        // Calculate importance and emotional significance
        const importanceScore = this.calculateImportanceScore(content);
        const emotionalSignificance = content.emotions ? 
            this.calculateEmotionalSignificance(content.emotions) : 0;

        metadata.set('importanceScore', importanceScore);
        metadata.set('emotionalSignificance', emotionalSignificance);
        metadata.set('consolidationStatus', metadata.get('consolidationStatus') || 'unconsolidated');

        // Ensure content has required fields
        const episodicContent = {
            timeSequence: content.timeSequence || Date.now(),
            location: content.location || 'unknown',
            actors: Array.isArray(content.actors) ? content.actors : [],
            actions: Array.isArray(content.actions) ? content.actions : [],
            emotions: content.emotions,
            context: content.context || {
                emotionalState: content.emotions,
                topicHistory: [],
                userPreferences: new Map()
            },
            coherenceScore: content.coherenceScore || 0,
            timestamp: content.timestamp || new Date(),
            relatedTo: Array.isArray(content.relatedTo) ? content.relatedTo : []
        };

        // Store the memory
        await this.storage.store({
            id: metadata.get('id') || crypto.randomUUID(),
            content: episodicContent,
            metadata: metadata,
            timestamp: new Date(),
            accessCount: 0,
            lastAccessed: new Date()
        });

        // Index the memory for search
        await this.index.add({
            id: metadata.get('id'),
            content: episodicContent,
            metadata: metadata,
            timestamp: new Date()
        });
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

        const memories = await this.retrieveWithType(idOrFilter, MemoryType.EPISODIC);
        
        // Update access counts for all retrieved memories
        for (const memory of memories) {
            const accessCount = (memory.metadata.get('accessCount') as number) || 0;
            memory.metadata.set('accessCount', accessCount + 1);
            memory.metadata.set('lastAccessed', new Date());
            await this.update(memory);
        }

        return memories;
    }

    /**
     * Find similar experiences with enhanced similarity scoring
     */
    public async findSimilarExperiences(memory: IEpisodicMemoryUnit): Promise<IEpisodicMemoryUnit[]> {
        const memories = await this.retrieve({
            types: [MemoryType.EPISODIC]
        });

        // Don't compare with self
        const otherMemories = memories.filter(m => m.id !== memory.id);

        // Calculate similarity scores
        const similarityScores = await Promise.all(otherMemories.map(async m => {
            const score = await this.calculateSimilarity(memory, m);
            return { memory: m, score };
        }));

        // Sort by similarity score and return top matches
        return similarityScores
            .filter(({ score }) => score > 0.5) // Only return memories with significant similarity
            .sort((a, b) => b.score - a.score)
            .map(({ memory }) => memory);
    }

    private async calculateSimilarity(memory1: IEpisodicMemoryUnit, memory2: IEpisodicMemoryUnit): Promise<number> {
        // Location similarity
        const locationSimilarity = memory1.content.location === memory2.content.location ? 1 : 0;

        // Action similarity
        const actions1 = new Set(memory1.content.actions);
        const actions2 = new Set(memory2.content.actions);
        const actionIntersection = new Set([...actions1].filter(x => actions2.has(x)));
        const actionUnion = new Set([...actions1, ...actions2]);
        const actionSimilarity = actionIntersection.size / actionUnion.size;

        // Actor similarity
        const actors1 = new Set(memory1.content.actors);
        const actors2 = new Set(memory2.content.actors);
        const actorIntersection = new Set([...actors1].filter(x => actors2.has(x)));
        const actorUnion = new Set([...actors1, ...actors2]);
        const actorSimilarity = actorIntersection.size / actorUnion.size;

        // Temporal proximity
        const temporalSimilarity = this.calculateTemporalProximity(
            memory1.content.timestamp,
            memory2.content.timestamp
        );

        // Emotional similarity
        const emotionalSimilarity = this.calculateEmotionalOverlap(
            memory1.content.emotions,
            memory2.content.emotions
        );

        // Weight the different factors
        const weights = {
            location: 0.3,
            action: 0.25,
            actor: 0.2,
            temporal: 0.15,
            emotional: 0.1
        };

        return (
            weights.location * locationSimilarity +
            weights.action * actionSimilarity +
            weights.actor * actorSimilarity +
            weights.temporal * temporalSimilarity +
            weights.emotional * emotionalSimilarity
        );
    }

    /**
     * Calculate emotional overlap between two experiences
     */
    private calculateEmotionalOverlap(emotions1: EmotionalContext | Map<string, number>, emotions2: EmotionalContext | Map<string, number>): number {
        if (!emotions1 || !emotions2) return 0;

        // Convert to EmotionalContext if needed
        const context1 = emotions1 instanceof Map ? this.createEmotionalContext(emotions1) : emotions1;
        const context2 = emotions2 instanceof Map ? this.createEmotionalContext(emotions2) : emotions2;
        
        const set1 = new Set(context1.emotions.keys());
        const set2 = new Set(context2.emotions.keys());
        
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);
        
        let totalDiff = 0;
        let count = 0;
        
        for (const emotion of intersection) {
            const intensity1 = context1.emotions.get(emotion) || 0;
            const intensity2 = context2.emotions.get(emotion) || 0;
            totalDiff += Math.abs(intensity1 - intensity2);
            count++;
        }
        
        if (count === 0) return 0;
        
        const overlapRatio = intersection.size / union.size;
        const intensitySimilarity = 1 - (totalDiff / count);
        
        return (overlapRatio + intensitySimilarity) / 2;
    }

    /**
     * Calculate temporal proximity between two timestamps
     */
    private calculateTemporalProximity(time1: Date, time2: Date): number {
        const timeDiff = Math.abs(time1.getTime() - time2.getTime());
        const maxTimeDiff = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
        return Math.max(0, 1 - timeDiff / maxTimeDiff);
    }

    protected async performCleanup(): Promise<void> {
        const memories = await this.retrieve({
            types: [MemoryType.EPISODIC]
        });

        // First, find and consolidate similar memories
        const consolidationGroups = new Map<string, IEpisodicMemoryUnit[]>();
        
        // Group memories by location first
        memories.forEach(memory => {
            const location = memory.content.location;
            if (!consolidationGroups.has(location)) {
                consolidationGroups.set(location, []);
            }
            consolidationGroups.get(location)?.push(memory);
        });

        // For each location group, consolidate similar memories
        for (const group of consolidationGroups.values()) {
            if (group.length < 2) continue;

            // Find similar memories within the group
            const consolidated = new Set<string>();
            for (let i = 0; i < group.length; i++) {
                if (consolidated.has(group[i].id)) continue;
                
                const similarMemories = [group[i]];
                for (let j = i + 1; j < group.length; j++) {
                    if (consolidated.has(group[j].id)) continue;
                    
                    const similarity = await this.calculateSimilarity(group[i], group[j]);
                    if (similarity > 0.7) { // High similarity threshold for consolidation
                        similarMemories.push(group[j]);
                        consolidated.add(group[j].id);
                    }
                }

                if (similarMemories.length > 1) {
                    await this.consolidateMemories(similarMemories);
                    consolidated.add(group[i].id);
                }
            }
        }

        // Then clean up remaining memories based on importance
        const remainingMemories = await this.retrieve({
            types: [MemoryType.EPISODIC]
        });

        for (const memory of remainingMemories) {
            // Calculate importance score
            const accessCount = memory.accessCount || 0;
            const emotionalSignificance = memory.metadata.get('emotionalSignificance') as number || 0;
            const lastAccessed = memory.lastAccessed || memory.timestamp;
            const age = (Date.now() - lastAccessed.getTime()) / (1000 * 60 * 60 * 24); // Age in days

            // Keep memories that are:
            // 1. Frequently accessed (high access count)
            // 2. Emotionally significant
            // 3. Recently accessed
            // 4. Part of consolidated memories
            const consolidationStatus = memory.metadata.get('consolidationStatus');
            const shouldKeep = 
                accessCount > 5 ||
                emotionalSignificance > this.MIN_EMOTIONAL_SIGNIFICANCE ||
                age < 7 || // Keep memories from last week
                consolidationStatus === 'consolidated';

            if (!shouldKeep) {
                await this.delete(memory.id);
            }
        }
    }

    private createEmotionalContext(emotions: Map<string, number>): EmotionalContext {
        // Calculate emotional dimensions based on the emotions
        let valence = 0.5;
        let arousal = 0.5;
        let dominance = 0.5;
        let confidence = 0.5;

        // If we have emotions, calculate dimensions
        if (emotions.size > 0) {
            // Simple mapping of common emotions to dimensions
            emotions.forEach((intensity, emotion) => {
                switch(emotion.toLowerCase()) {
                    case 'happy':
                    case 'excited':
                    case 'proud':
                        valence += intensity * 0.3;
                        arousal += intensity * 0.2;
                        dominance += intensity * 0.2;
                        break;
                    case 'sad':
                    case 'afraid':
                    case 'anxious':
                        valence -= intensity * 0.3;
                        arousal += intensity * 0.2;
                        dominance -= intensity * 0.2;
                        break;
                    case 'angry':
                    case 'frustrated':
                        valence -= intensity * 0.3;
                        arousal += intensity * 0.3;
                        dominance += intensity * 0.1;
                        break;
                    case 'calm':
                    case 'relaxed':
                        valence += intensity * 0.2;
                        arousal -= intensity * 0.3;
                        dominance += intensity * 0.1;
                        break;
                }
                confidence = Math.min(1, confidence + intensity * 0.1);
            });

            // Normalize values to [0,1] range
            valence = Math.max(0, Math.min(1, valence));
            arousal = Math.max(0, Math.min(1, arousal));
            dominance = Math.max(0, Math.min(1, dominance));
        }

        return new EmotionalContextImpl(
            emotions,
            valence,
            arousal,
            dominance,
            confidence
        );
    }

    /**
     * Calculate importance score for a memory
     */
    private calculateImportanceScore(content: any): number {
        let score = 0.5; // Base score

        // Add points for completeness
        if (content.actors?.length) score += 0.2;
        if (content.actions?.length) score += 0.2;
        if (content.location) score += 0.1;
        if (content.emotions?.getSize()) score += 0.2;

        // Additional importance from emotional intensity
        if (content.emotions instanceof Object) {
            const emotionValues = Array.from(content.emotions.emotions.values()) as number[];
            const maxEmotion = Math.max(...emotionValues);
            score += maxEmotion * 0.3;
        }

        return Math.min(1, score);
    }

    /**
     * Calculate emotional significance of a memory
     */
    private calculateEmotionalSignificance(emotions: EmotionalContext | Map<string, number>): number {
        if (!emotions) return 0;

        // Convert to EmotionalContext if needed
        const emotionalContext = emotions instanceof Map ? 
            this.createEmotionalContext(emotions) : emotions;

        if (emotionalContext.emotions.size === 0) return 0;
        
        // Calculate average emotional intensity
        let totalIntensity = 0;
        emotionalContext.emotions.forEach(intensity => {
            totalIntensity += intensity;
        });
        
        return totalIntensity / emotionalContext.emotions.size;
    }

    /**
     * Check if memory should be consolidated with others
     */
    public async checkForConsolidation(memory: IEpisodicMemoryUnit): Promise<void> {
        const similarMemories = await this.findSimilarExperiences(memory);
        
        if (similarMemories.length >= this.MIN_RELATIONSHIP_DENSITY) {
            await this.consolidateMemories([memory, ...similarMemories]);
        }
    }

    public async cleanup(): Promise<void> {
        await this.performCleanup();
    }

    protected async consolidateMemories(memories: IEpisodicMemoryUnit[]): Promise<void> {
        if (memories.length < 2) return;

        // Create consolidated memory
        const consolidatedMemory: IEpisodicMemoryUnit = {
            id: crypto.randomUUID(),
            content: {
                timeSequence: Math.min(...memories.map(m => m.content.timeSequence)),
                location: this.getMostFrequent(memories.map(m => m.content.location)),
                actors: Array.from(new Set(memories.flatMap(m => m.content.actors))),
                actions: Array.from(new Set(memories.flatMap(m => m.content.actions))),
                emotions: this.createEmotionalContext(
                    new Map(Array.from(memories.reduce((acc, m) => {
                        if (m.content.emotions instanceof Map) {
                            m.content.emotions.forEach((v, k) => acc.set(k, (acc.get(k) || 0) + v));
                        } else if (m.content.emotions?.emotions) {
                            m.content.emotions.emotions.forEach((v, k) => acc.set(k, (acc.get(k) || 0) + v));
                        }
                        return acc;
                    }, new Map<string, number>())).map(([k, v]) => [k, v / memories.length]))
                ),
                context: memories[0].content.context,
                coherenceScore: memories[0].content.coherenceScore,
                timestamp: new Date(Math.min(...memories.map(m => m.content.timestamp.getTime()))),
                relatedTo: Array.from(new Set(memories.flatMap(m => m.content.relatedTo || [])))
            },
            metadata: new Map(),
            timestamp: new Date(),
            accessCount: memories.reduce((sum, m) => sum + (m.accessCount || 0), 0),
            lastAccessed: new Date(Math.max(...memories.map(m => (m.lastAccessed || m.timestamp).getTime())))
        };

        // Set metadata
        consolidatedMemory.metadata.set('type', MemoryType.EPISODIC);
        consolidatedMemory.metadata.set('consolidationStatus', 'consolidated');
        consolidatedMemory.metadata.set('consolidatedFrom', memories.map(m => m.id));
        consolidatedMemory.metadata.set('emotionalSignificance', 
            Math.max(...memories.map(m => m.metadata.get('emotionalSignificance') as number || 0)));

        // Store consolidated memory
        await this.store(consolidatedMemory.content, consolidatedMemory.metadata);

        // Mark original memories as consolidated
        for (const memory of memories) {
            const metadata = new Map(memory.metadata);
            metadata.set('consolidationStatus', 'consolidated');
            metadata.set('consolidatedInto', consolidatedMemory.id);
            await this.update({
                ...memory,
                metadata
            });
        }
    }

    public async update(memory: IMemoryUnit): Promise<void> {
        // Ensure emotions are properly converted to EmotionalContext
        if (memory.content.emotions instanceof Map) {
            memory.content.emotions = this.createEmotionalContext(memory.content.emotions);
        }

        // Recalculate emotional significance
        const emotionalSignificance = this.calculateEmotionalSignificance(memory.content.emotions);
        memory.metadata.set('emotionalSignificance', emotionalSignificance);

        await this.storage.update(memory);
        await this.index.update(memory);
    }

    public async delete(id: string): Promise<void> {
        await this.storage.delete(id);
        await this.index.remove(id);
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
}
