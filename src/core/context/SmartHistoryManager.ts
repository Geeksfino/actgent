import { ConversationMessage, IHistoryManager, InteractionFlow } from './types';
import { WorkingMemory } from '../memory/WorkingMemory';
import { IOptimizer } from './optimizers/types';
import { MemoryType } from '../memory/types';

interface MessageNode {
    message: ConversationMessage;
    references: Set<string>;
    referencedBy: Set<string>;
    relevanceScore: number;
}

/**
 * Enhanced history manager with smart context tracking and optimization
 */
export class SmartHistoryManager implements IHistoryManager {
    private messages: Map<string, MessageNode>;
    private workingMemory: WorkingMemory;
    private optimizers: Map<string, IOptimizer>;
    private maxHistorySize: number;

    constructor(workingMemory: WorkingMemory, maxHistorySize: number = 100) {
        this.messages = new Map();
        this.workingMemory = workingMemory;
        this.optimizers = new Map();
        this.maxHistorySize = maxHistorySize;
    }

    public async addMessage(message: ConversationMessage): Promise<void> {
        const node: MessageNode = {
            message,
            references: new Set(message.metadata?.references || []),
            referencedBy: new Set(),
            relevanceScore: message.relevanceScore
        };

        // Update reference connections
        for (const refId of node.references) {
            const refNode = this.messages.get(refId);
            if (refNode) {
                refNode.referencedBy.add(message.id);
            }
        }

        this.messages.set(message.id, node);
        await this.updateRelevanceScores();
        await this.trimHistory();

        // Store in working memory with metadata as a Map
        const metadata = new Map();
        // Add root-level properties to metadata
        metadata.set('role', message.role);
        metadata.set('relevanceScore', message.relevanceScore);
        metadata.set('importance', message.importance);
        metadata.set('tokens', message.tokens);

        // Add any additional metadata
        if (message.metadata) {
            Object.entries(message.metadata).forEach(([key, value]) => {
                if (!metadata.has(key)) {  // Don't override root-level properties
                    metadata.set(key, value);
                }
            });
        }

        await this.workingMemory.store({
            id: message.id,
            type: MemoryType.WORKING,
            content: message.content,
            metadata,
            timestamp: message.timestamp,
            source: 'conversation'
        });
    }

    public async getContext(): Promise<string> {
        const relevantMessages = Array.from(this.messages.values())
            .map(node => node.message)
            .sort((a, b) => {
                const scoreA = a.metadata?.relevanceScore || 0;
                const scoreB = b.metadata?.relevanceScore || 0;
                if (scoreA !== scoreB) return scoreB - scoreA;
                return a.timestamp.getTime() - b.timestamp.getTime();
            });

        return relevantMessages
            .map(msg => `${msg.role}: ${msg.content}`)
            .join('\n');
    }

    public async optimize(): Promise<void> {
        const messages = Array.from(this.messages.values()).map(node => node.message);
        let optimizedMessages = messages;

        // Apply all optimizers in sequence
        for (const optimizer of this.optimizers.values()) {
            optimizedMessages = await optimizer.optimize(optimizedMessages);
        }
        
        // Update relevance scores based on optimization results
        const optimizedIds = new Set(optimizedMessages.map(m => m.id));
        const toRemove: string[] = [];

        for (const [id, node] of this.messages.entries()) {
            if (!optimizedIds.has(id)) {
                toRemove.push(id);
            }
        }

        // Remove filtered messages
        for (const id of toRemove) {
            this.messages.delete(id);
        }

        // Ensure working memory is in sync
        const existingMemories = await this.workingMemory.retrieve({
            types: [MemoryType.WORKING]
        });

        // Remove old memories
        for (const memory of existingMemories) {
            if (!optimizedIds.has(memory.id)) {
                await this.workingMemory.delete(memory.id);
            }
        }

        await this.trimHistory();
    }

    public addInteractionFlow(flow: InteractionFlow): void {
        const node = this.messages.get(flow.messageId);
        if (!node) return;

        node.message.metadata = {
            ...node.message.metadata,
            flow: flow.flow,
            domain: flow.domain,
            goals: flow.goals
        };

        // Update references
        node.references = new Set(flow.references);
        for (const refId of flow.references) {
            const refNode = this.messages.get(refId);
            if (refNode) {
                refNode.referencedBy.add(flow.messageId);
            }
        }
    }

    public async resolveReferences(messageId: string): Promise<ConversationMessage[]> {
        const node = this.messages.get(messageId);
        if (!node) return [];

        const resolved: ConversationMessage[] = [];
        const visited = new Set<string>();

        const traverse = (id: string) => {
            if (visited.has(id)) return;
            visited.add(id);

            const current = this.messages.get(id);
            if (!current) return;

            resolved.push(current.message);

            // Traverse references
            for (const refId of current.references) {
                traverse(refId);
            }
        };

        traverse(messageId);
        return resolved.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    }

    public registerOptimizer(name: string, optimizer: IOptimizer): void {
        this.optimizers.set(name, optimizer);
    }

    private async updateRelevanceScores(): Promise<void> {
        const now = new Date();
        for (const node of this.messages.values()) {
            // Apply time decay to relevance score
            const messageTime = new Date(node.message.timestamp);
            const hoursDiff = (now.getTime() - messageTime.getTime()) / (1000 * 60 * 60);
            const timeDecay = Math.exp(-hoursDiff / 24); // Decay over 24 hours
            
            // Update relevance score
            const newScore = node.relevanceScore * timeDecay;
            node.relevanceScore = newScore;
            node.message.relevanceScore = newScore;
            node.message.metadata = {
                ...node.message.metadata,
                relevanceScore: newScore
            };

            // Update in working memory with metadata as a Map
            const metadata = new Map();
            // Add root-level properties to metadata
            metadata.set('role', node.message.role);
            metadata.set('relevanceScore', newScore);
            metadata.set('importance', node.message.importance);
            metadata.set('tokens', node.message.tokens);

            // Add any additional metadata
            if (node.message.metadata) {
                Object.entries(node.message.metadata).forEach(([key, value]) => {
                    if (!metadata.has(key)) {  // Don't override root-level properties
                        metadata.set(key, value);
                    }
                });
            }

            await this.workingMemory.store({
                id: node.message.id,
                type: MemoryType.WORKING,
                content: node.message.content,
                metadata,
                timestamp: node.message.timestamp,
                source: 'conversation'
            });
        }
    }

    private async trimHistory(): Promise<void> {
        if (this.messages.size <= this.maxHistorySize) return;

        const sortedMessages = Array.from(this.messages.entries())
            .sort(([_, a], [__, b]) => {
                const scoreA = a.message.metadata?.relevanceScore || 0;
                const scoreB = b.message.metadata?.relevanceScore || 0;
                return scoreB - scoreA;
            });

        // Keep only the most relevant messages
        const toRemove = sortedMessages.slice(this.maxHistorySize);
        for (const [id] of toRemove) {
            this.messages.delete(id);
        }
    }
}
