import { ConversationMessage, UserGoal, DomainContext, InteractionFlow, InteractionFlowType } from './types';
import { SmartHistoryManager } from './SmartHistoryManager';
import { WorkingMemory } from '../memory/WorkingMemory';
import { NLPService } from '../memory/semantic/nlp/NLPService';
import crypto from 'crypto';

/**
 * Enhanced context manager with smart history management for conversations
 */
export class ConversationContextManager {
    private historyManager: SmartHistoryManager;
    private workingMemory: WorkingMemory;
    private context: Map<string, any>;
    private activeGoals: Map<string, UserGoal>;
    private domainContexts: Map<string, DomainContext>;
    private currentDomain?: string;
    private nlpService: NLPService;
    private goalConceptCache: Map<string, { concepts: string[], timestamp: Date }>;

    constructor(workingMemory: WorkingMemory, nlpService: NLPService) {
        this.workingMemory = workingMemory;
        this.historyManager = new SmartHistoryManager(workingMemory);
        this.context = new Map();
        this.activeGoals = new Map();
        this.domainContexts = new Map();
        this.nlpService = nlpService;
        this.goalConceptCache = new Map();
    }

    public async addMessage(message: ConversationMessage): Promise<void> {
        // Add domain and goals to message metadata
        if (this.currentDomain) {
            message.metadata = message.metadata || {};
            message.metadata.domain = this.currentDomain;
        }

        const relevantGoals = await this.findRelevantGoals(message.content);
        if (relevantGoals.length > 0) {
            message.metadata = message.metadata || {};
            message.metadata.goals = relevantGoals.map(g => g.id);
            
            // Update goal relevance scores
            for (const goal of relevantGoals) {
                if (goal.metadata?.relevanceScore) {
                    goal.metadata.relevanceScore = (goal.metadata.relevanceScore as number + 1);
                } else {
                    goal.metadata = goal.metadata || {};
                    goal.metadata.relevanceScore = 1;
                }
                this.activeGoals.set(goal.id, goal);
            }
        }

        this.historyManager.addMessage(message);
    }

    public async getContext(): Promise<Map<string, any>> {
        const historyContext = await this.historyManager.getContext();
        this.context.set('history', historyContext);
        this.context.set('goals', Array.from(this.activeGoals.values()));
        this.context.set('domain', this.currentDomain ? this.domainContexts.get(this.currentDomain) : null);
        return this.context;
    }

    public async optimize(): Promise<void> {
        await this.historyManager.optimize();
        this.cleanupGoals();
        this.updateDomainConfidence();
    }

    // Goal Management
    public addUserGoal(goal: Partial<UserGoal>): string {
        const id = crypto.randomUUID();
        const newGoal: UserGoal = {
            id,
            description: goal.description || '',
            priority: goal.priority || 1,
            status: goal.status || 'active',
            createdAt: new Date(),
            updatedAt: new Date(),
            parentGoalId: goal.parentGoalId,
            metadata: goal.metadata || {}
        };

        this.activeGoals.set(id, newGoal);
        return id;
    }

    public updateUserGoal(id: string, updates: Partial<UserGoal>): void {
        const goal = this.activeGoals.get(id);
        if (!goal) return;

        Object.assign(goal, {
            ...updates,
            updatedAt: new Date()
        });

        this.activeGoals.set(id, goal);
    }

    public getActiveGoals(): UserGoal[] {
        return Array.from(this.activeGoals.values())
            .filter(g => g.status === 'active')
            .sort((a, b) => b.priority - a.priority);
    }

    // Domain Context Management
    public setDomainContext(context: DomainContext): void {
        this.domainContexts.set(context.domain, {
            ...context,
            activeSince: new Date()
        });
        this.currentDomain = context.domain;
    }

    public getDomainRules(): Map<string, any> {
        if (!this.currentDomain) return new Map();
        return this.domainContexts.get(this.currentDomain)?.rules || new Map();
    }

    public getCurrentDomain(): DomainContext | undefined {
        return this.currentDomain ? this.domainContexts.get(this.currentDomain) : undefined;
    }

    // Basic context operations
    public setContext(key: string, value: any): void {
        this.context.set(key, value);
    }

    public getContextValue(key: string): any {
        return this.context.get(key);
    }

    public clearContext(): void {
        this.context.clear();
        // Don't clear goals and domains as they are managed separately
    }

    // Interaction Flow Management
    public async addInteractionFlow(flow: InteractionFlow): Promise<void> {
        // First get the goals if needed
        const goals = flow.goals || (await this.findRelevantGoals('')).map(g => g.id);

        const message: ConversationMessage = {
            id: flow.messageId,
            content: '',  // Will be set by addMessage
            role: 'system',
            timestamp: new Date(),
            relevanceScore: 1,
            importance: 1,
            tokens: 0,
            metadata: {
                flow: flow.flow,
                references: flow.references,
                domain: flow.domain || this.currentDomain,
                goals
            }
        };

        this.historyManager.addMessage(message);
    }

    private async findRelevantGoals(content: string): Promise<UserGoal[]> {
        if (!content.trim()) return [];
        
        const relevantGoals: UserGoal[] = [];
        const messageConceptsResult = await this.nlpService.extractConcepts(content);
        const messageConcepts = messageConceptsResult.concepts.map(concept => {
            if (typeof concept === 'string') return concept;
            return (concept as { text?: string }).text || '';
        });

        const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
        const SIMILARITY_THRESHOLD = 0.7;

        const activeGoals = this.getActiveGoals();
        for (const goal of activeGoals) {
            try {
                // Check cache or extract concepts
                let goalConcepts: string[];
                const cached = this.goalConceptCache.get(goal.id);
                
                if (cached && (new Date().getTime() - cached.timestamp.getTime()) < CACHE_DURATION) {
                    goalConcepts = cached.concepts;
                } else {
                    const goalConceptsResult = await this.nlpService.extractConcepts(goal.description);
                    goalConcepts = goalConceptsResult.concepts.map(concept => {
                        if (typeof concept === 'string') return concept;
                        return (concept as { text?: string }).text || '';
                    });
                    this.goalConceptCache.set(goal.id, {
                        concepts: goalConcepts,
                        timestamp: new Date()
                    });
                }

                // Calculate similarity between concepts
                let totalSimilarity = 0;
                let comparisonCount = 0;

                for (const messageConcept of messageConcepts) {
                    for (const goalConcept of goalConcepts) {
                        const similarity = await this.nlpService.calculateSimilarity(
                            messageConcept,
                            goalConcept
                        );
                        totalSimilarity += similarity;
                        comparisonCount++;
                    }
                }

                // Calculate average similarity
                const avgSimilarity = comparisonCount > 0 
                    ? totalSimilarity / comparisonCount 
                    : 0;

                // If similarity is high enough, consider the goal relevant
                if (avgSimilarity >= SIMILARITY_THRESHOLD) {
                    // Add similarity score to goal metadata
                    goal.metadata = goal.metadata || {};
                    goal.metadata.lastSimilarityScore = avgSimilarity;
                    relevantGoals.push(goal);
                }
            } catch (error) {
                console.error(`Error calculating relevance for goal ${goal.id}:`, error);
            }
        }

        // Sort by similarity score and priority
        return relevantGoals.sort((a, b) => {
            const scoreA = (a.metadata?.lastSimilarityScore as number || 0) * a.priority;
            const scoreB = (b.metadata?.lastSimilarityScore as number || 0) * b.priority;
            return scoreB - scoreA;
        });
    }

    private cleanupGoals(): void {
        const now = new Date();
        for (const [id, goal] of this.activeGoals) {
            if (goal.metadata?.deadline && new Date(goal.metadata.deadline) < now) {
                this.updateUserGoal(id, { status: 'completed' });
            }
        }
    }

    private updateDomainConfidence(): void {
        if (!this.currentDomain) return;

        const domain = this.domainContexts.get(this.currentDomain);
        if (!domain) return;

        // Decay confidence over time
        const hoursSinceActive = (new Date().getTime() - domain.activeSince.getTime()) / (1000 * 60 * 60);
        domain.confidence = Math.max(0.1, domain.confidence * Math.exp(-0.1 * hoursSinceActive));

        if (domain.confidence < 0.3) {
            this.currentDomain = undefined;
        }
    }
}
