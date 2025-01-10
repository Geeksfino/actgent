import { ConversationMessage, UserGoal, DomainContext, InteractionFlow } from './types';
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
        if (!message.content || typeof message.content !== 'string') {
            throw new Error('Invalid message content');
        }

        message.content = message.content.trim();
        if (!message.content) {
            throw new Error('Empty message content');
        }

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

        // Add to history manager
        this.historyManager.addMessage(message);

        // Update context with latest message
        const history = await this.historyManager.getContext();
        this.context.set('history', history);
    }

    public async getContext(): Promise<Map<string, any>> {
        // Update history from history manager
        const history = await this.historyManager.getContext();
        this.context.set('history', history);
        return this.context;
    }

    public getContextValue(key: string): any {
        return this.context.get(key);
    }

    public setContext(key: string, value: any): void {
        this.context.set(key, value);
    }

    public clearContext(): void {
        this.context.clear();
    }

    public addUserGoal(goal: Partial<UserGoal>): string {
        const id = goal.id || crypto.randomUUID();
        const newGoal: UserGoal = {
            id,
            description: goal.description || '',
            priority: goal.priority || 1,
            status: goal.status || 'active',
            createdAt: goal.createdAt || new Date(),
            updatedAt: goal.updatedAt || new Date(),
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

    public async findRelevantGoals(content: string): Promise<UserGoal[]> {
        const contentConcepts = await this.getContentConcepts(content);
        const goals = Array.from(this.activeGoals.values());
        
        return goals.filter(goal => {
            const goalConcepts = this.goalConceptCache.get(goal.id)?.concepts || [];
            return goalConcepts.some(concept => contentConcepts.includes(concept));
        }).sort((a, b) => (b.metadata?.relevanceScore || 0) - (a.metadata?.relevanceScore || 0));
    }

    public setDomainContext(domain: DomainContext): void {
        this.domainContexts.set(domain.domain, domain);
        this.currentDomain = domain.domain;
    }

    public getCurrentDomain(): DomainContext | undefined {
        if (!this.currentDomain) return undefined;
        return this.domainContexts.get(this.currentDomain);
    }

    public addInteractionFlow(flow: InteractionFlow): void {
        this.historyManager.addInteractionFlow(flow);
    }

    public async optimize(): Promise<void> {
        // Optimize history
        await this.historyManager.optimize();

        // Decay domain confidence
        if (this.currentDomain) {
            const domain = this.domainContexts.get(this.currentDomain);
            if (domain) {
                domain.confidence *= 0.95; // Apply decay factor
                if (domain.confidence < 0.3) {
                    this.currentDomain = undefined;
                }
            }
        }

        // Clean up expired goal concepts
        const now = new Date();
        for (const [id, cache] of this.goalConceptCache) {
            if (now.getTime() - cache.timestamp.getTime() > 24 * 60 * 60 * 1000) {
                this.goalConceptCache.delete(id);
            }
        }
    }

    private async getContentConcepts(content: string): Promise<string[]> {
        try {
            const result = await this.nlpService.extractConcepts(content);
            // Convert ConceptNode[] to string[] using the label field
            return result.concepts.map(concept => 
                typeof concept === 'string' ? concept : concept.label
            );
        } catch (error) {
            console.error('Error extracting concepts:', error);
            return [];
        }
    }
}
