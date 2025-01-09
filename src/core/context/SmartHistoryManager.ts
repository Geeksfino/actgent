import { ConversationMessage, IHistoryManager, InteractionFlow } from './types';
import { WorkingMemory } from '../memory/WorkingMemory';

interface MessageNode {
    message: ConversationMessage;
    references: Set<string>;
    referencedBy: Set<string>;
}

/**
 * Enhanced history manager with smart context tracking
 */
export class SmartHistoryManager implements IHistoryManager {
    private messages: Map<string, MessageNode>;
    private workingMemory: WorkingMemory;

    constructor(workingMemory: WorkingMemory) {
        this.messages = new Map();
        this.workingMemory = workingMemory;
    }

    public addMessage(message: ConversationMessage): void {
        const node: MessageNode = {
            message,
            references: new Set(message.metadata?.references || []),
            referencedBy: new Set()
        };

        // Update reference connections
        for (const refId of node.references) {
            const refNode = this.messages.get(refId);
            if (refNode) {
                refNode.referencedBy.add(message.id);
            }
        }

        this.messages.set(message.id, node);
        this.updateRelevanceScores();
    }

    public async getContext(): Promise<string> {
        const relevantMessages = Array.from(this.messages.values())
            .map(node => node.message)
            .sort((a, b) => b.relevanceScore - a.relevanceScore);

        return relevantMessages
            .map(msg => `${msg.role}: ${msg.content}`)
            .join('\n');
    }

    public async optimize(): Promise<void> {
        const threshold = 0.3;
        const oldMessages = Array.from(this.messages.values())
            .filter(node => node.message.relevanceScore < threshold);

        for (const { message } of oldMessages) {
            await this.archiveMessage(message);
        }
    }

    public addInteractionFlow(flow: InteractionFlow): void {
        const message = this.messages.get(flow.messageId);
        if (!message) return;

        // Update message metadata with flow information
        message.message.metadata = {
            ...message.message.metadata,
            flow: flow.flow,
            domain: flow.domain,
            goals: flow.goals
        };

        // Update references
        message.references = new Set(flow.references);
        for (const refId of flow.references) {
            const refNode = this.messages.get(refId);
            if (refNode) {
                refNode.referencedBy.add(flow.messageId);
            }
        }

        this.updateRelevanceScores();
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

    private async archiveMessage(message: ConversationMessage): Promise<void> {
        // Store in working memory before removal
        await this.workingMemory.store(message);
        
        // Remove from message graph
        const node = this.messages.get(message.id);
        if (!node) return;

        // Update references
        for (const refId of node.references) {
            const refNode = this.messages.get(refId);
            if (refNode) {
                refNode.referencedBy.delete(message.id);
            }
        }

        for (const refById of node.referencedBy) {
            const refNode = this.messages.get(refById);
            if (refNode) {
                refNode.references.delete(message.id);
            }
        }

        this.messages.delete(message.id);
    }

    private updateRelevanceScores(): void {
        // Calculate PageRank-like scores based on references
        const dampingFactor = 0.85;
        const iterations = 10;
        const scores = new Map<string, number>();

        // Initialize scores
        for (const [id] of this.messages) {
            scores.set(id, 1.0);
        }

        // Iterate to converge scores
        for (let i = 0; i < iterations; i++) {
            const newScores = new Map<string, number>();

            for (const [id, node] of this.messages) {
                let score = (1 - dampingFactor);
                
                // Add scores from references
                for (const refById of node.referencedBy) {
                    const refNode = this.messages.get(refById);
                    if (refNode) {
                        score += dampingFactor * (scores.get(refById) || 0) / refNode.references.size;
                    }
                }

                newScores.set(id, score);
            }

            // Update scores
            for (const [id, score] of newScores) {
                scores.set(id, score);
            }
        }

        // Update message relevance scores
        for (const [id, node] of this.messages) {
            node.message.relevanceScore = scores.get(id) || 0;
        }
    }
}
