import { IMemoryUnit, MemoryFilter, MemoryType } from './base';
import { WorkingMemoryContext } from './context';
import { WorkingContextManager } from './WorkingContextManager';
import { WorkingMemory } from './modules/working/WorkingMemory';
import { EpisodicMemory } from './modules/episodic/EpisodicMemory';
import { SemanticMemory } from './modules/semantic/SemanticMemory';
import { ProceduralMemory } from './modules/procedural/ProceduralMemory';
import { EphemeralMemory } from './modules/ephemeral/EphemeralMemory';
import { MemoryTransitionManager } from './MemoryTransitionManager';
import { loggers } from './logging';

// Import storage factories
import { WorkingMemoryStorageFactory } from './modules/working/WorkingMemoryStorageFactory';
import { EpisodicMemoryStorageFactory } from './modules/episodic/EpisodicMemoryStorageFactory';
import { SemanticMemoryStorageFactory } from './modules/semantic/SemanticMemoryStorageFactory';
import { ProceduralMemoryStorageFactory } from './modules/procedural/ProceduralMemoryStorageFactory';

// Import monitors and handlers
import { EphemeralMemoryCapacityMonitor } from './modules/ephemeral/EphemeralMemoryCapacityMonitor';
import { WorkingMemoryEventHandler } from './modules/working/WorkingMemoryEventHandler';

import { z } from 'zod';

/**
 * Main entry point for the agent's memory system.
 * Provides a simple interface for agents to store and retrieve memories,
 * while handling the complexity of memory management internally.
 */
export class AgentMemorySystem {
    private workingMemory: WorkingMemory;
    private episodicMemory: EpisodicMemory;
    private semanticMemory: SemanticMemory;
    private proceduralMemory: ProceduralMemory;
    private ephemeralMemory: EphemeralMemory;

    private transitionManager: MemoryTransitionManager;
    private contextManager: WorkingContextManager;
    private logger = loggers.general;

    constructor() {
        // Create memories with their module-specific storage
        this.workingMemory = WorkingMemoryStorageFactory.create();
        this.episodicMemory = EpisodicMemoryStorageFactory.create();
        this.semanticMemory = SemanticMemoryStorageFactory.create();
        this.proceduralMemory = ProceduralMemoryStorageFactory.create();
        
        // Keep items for 30 seconds in ephemeral memory
        this.ephemeralMemory = new EphemeralMemory(-1, 500);  // Non-expiring items, max 5 items

        this.transitionManager = new MemoryTransitionManager();
        this.contextManager = new WorkingContextManager(this.workingMemory);

        this.setupEventHandlers();
        this.transitionManager.startMonitoring();
        this.logger.debug('Memory system initialized and monitoring started');
    }

    private setupEventHandlers(): void {
        // Register capacity monitors
        const ephemeralMonitor = new EphemeralMemoryCapacityMonitor(
            'ephemeral-capacity',
            this.ephemeralMemory,
            {
                maxItems: this.ephemeralMemory.capacity(),  // Fixed method name
                warningThreshold: 0.8  // Trigger at 80% capacity
            }
        );
        this.transitionManager.registerMonitor(ephemeralMonitor);
        this.logger.debug('Registered ephemeral memory capacity monitor');

        // Register working memory event handler
        const workingHandler = new WorkingMemoryEventHandler(
            this.workingMemory,
            0.9  // Consolidate at 90% capacity
        );
        this.transitionManager.registerHandler(workingHandler);
        this.logger.debug('Registered working memory event handler');
    }

    /**
     * Remember something. The memory system will automatically determine
     * where and how to store it based on its characteristics.
     * All input first goes to ephemeral memory, then gets processed by memory handlers
     * based on events from MemoryTransitionManager.
     */
    public async remember<C>(content: C | string, schema?: z.ZodSchema<C>, metadata?: Map<string, any>): Promise<void> {
        if (metadata?.get('role') === 'user' || metadata?.get('role') === 'assistant') {
            const memoryUnit = this.ephemeralMemory.createMemoryUnit(content, schema, metadata);
            await this.ephemeralMemory.store(memoryUnit);
        }
    }

    /**
     * Update agent's session context with new information
     */
    public async updateContext(key: string, value: any): Promise<void> {
        await this.contextManager.setContext(key, value);
    }

    /**
     * Recall memories based on a query. The memory system will search
     * across all relevant memory stores.
     */
    public async recall(query: string | MemoryFilter): Promise<IMemoryUnit[]> {
        let filter: MemoryFilter;
        if (typeof query === 'string') {
            filter = { query };
        } else {
            filter = query;
        }

        // Search in each memory store
        const [workingResults, episodicResults, semanticResults, proceduralResults, ephemeralResults] = await Promise.all([
            this.workingMemory.query(filter),
            this.episodicMemory.query(filter),
            this.semanticMemory.query(filter),
            this.proceduralMemory.query(filter),
            this.ephemeralMemory.query(filter)
        ]);

        // Combine and rank results
        const allResults = [...workingResults, ...episodicResults, ...semanticResults, ...proceduralResults, ...ephemeralResults];
        return this.rankMemories(allResults, this.contextManager.getCurrentContext());
    }

    /**
     * Rank memories by their relevance, recency, and contextual alignment
     */
    private rankMemories(memories: IMemoryUnit[], context: WorkingMemoryContext): IMemoryUnit[] {
        return memories.sort((a, b) => {
            // Get relevance scores (default to 0 if not set)
            const relevanceA = a.metadata.get('relevance') as number || 0;
            const relevanceB = b.metadata.get('relevance') as number || 0;

            // Get recency scores based on timestamp
            const recencyA = a.timestamp.getTime();
            const recencyB = b.timestamp.getTime();

            // Get contextual alignment scores
            const alignmentA = this.calculateContextualAlignment(a, context);
            const alignmentB = this.calculateContextualAlignment(b, context);

            // Combine scores with weights
            const scoreA = (0.4 * relevanceA) + (0.3 * recencyA) + (0.3 * alignmentA);
            const scoreB = (0.4 * relevanceB) + (0.3 * recencyB) + (0.3 * alignmentB);

            return scoreB - scoreA;
        });
    }

    /**
     * Calculate how well a memory aligns with current context
     */
    private calculateContextualAlignment(memory: IMemoryUnit, context: WorkingMemoryContext): number {
        let score = 0;
        const memoryContext = memory.metadata.get('context') as WorkingMemoryContext | undefined;
        
        if (!memoryContext) return 0;

        // Compare goals
        const sharedGoals = new Set(
            [...memoryContext.userGoals].filter(x => context.userGoals.has(x))
        );
        score += sharedGoals.size * 0.2;

        // Compare topics
        const sharedTopics = memoryContext.topicHistory.filter(
            topic => context.topicHistory.includes(topic)
        );
        score += sharedTopics.length * 0.2;

        // Compare emotional state
        if (memoryContext.emotionalState && context.emotionalState) {
            const valenceDiff = Math.abs(
                memoryContext.emotionalState.valence - context.emotionalState.valence
            );
            const arousalDiff = Math.abs(
                memoryContext.emotionalState.arousal - context.emotionalState.arousal
            );
            score += (2 - valenceDiff - arousalDiff) * 0.2;
        }

        return score;
    }

    /**
     * Forget a specific memory or set of memories
     */
    public async forget(idOrFilter: string | MemoryFilter): Promise<void> {
        if (typeof idOrFilter === 'string') {
            await Promise.all([
                this.workingMemory.delete(idOrFilter),
                this.episodicMemory.delete(idOrFilter),
                this.semanticMemory.delete(idOrFilter),
                this.proceduralMemory.delete(idOrFilter)
            ]);
        } else {
            const memories = await this.recall(idOrFilter);
            await Promise.all(
                memories.map(memory => this.forget(memory.id))
            );
        }
    }

    /**
     * Process a user's message/action, marking the end of a user turn
     */
    public async processUserTurn(input: string): Promise<void> {
        try {
            // Process user input...
            
            // Signal end of user turn to transition manager
            this.transitionManager.onUserTurnEnd();
            
            // Update context
            await this.contextManager.setContext('lastUserInput', {
                content: input,
                timestamp: new Date()
            });
        } catch (error) {
            this.logger.error('Error processing user turn:', error);
            throw error;
        }
    }

    /**
     * Process assistant's response, marking the end of an assistant turn
     */
    public async processAssistantTurn(response: string): Promise<void> {
        try {
            // Process assistant response...
            
            // Signal end of assistant turn to transition manager
            this.transitionManager.onAssistantTurnEnd();
            
            // Update context
            await this.contextManager.setContext('lastAssistantResponse', {
                content: response,
                timestamp: new Date()
            });
        } catch (error) {
            this.logger.error('Error processing assistant turn:', error);
            throw error;
        }
    }

    /**
     * Recall recent messages in OpenAI chat completion format
     * @param limit Optional number of messages to return
     * @returns Array of messages in OpenAI format {role, content}
     */
    public async recallRecentMessages(limit?: number): Promise<Array<{ role: 'system' | 'user' | 'assistant', content: string }>> {
        // Get messages in FIFO order
        const memories = await this.ephemeralMemory.query({ limit });
        
        // Convert to OpenAI format
        return memories.map(memory => ({
            role: memory.metadata.get('role') as 'system' | 'user' | 'assistant' || 'assistant',
            content: String(memory.content)
        }));
    }

    /**
     * Start the memory system
     */
    public start(): void {
        this.transitionManager.startMonitoring();
        this.contextManager.initialize();
    }

    /**
     * Stop the memory system
     */
    public stop(): void {
        this.transitionManager.stopMonitoring();
        this.contextManager.dispose();
    }

}
