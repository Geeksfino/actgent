import { InMemoryGraphStorage } from '../../../src/core/memory/graph/data/InMemoryGraphStorage';
import { IGraphNode, GraphNodeType } from '../../../src/core/memory/graph/data/types';
import { BenchmarkConversation, BenchmarkMetrics, BenchmarkQuery } from './types';
import { IBenchmarkRunner } from './base';

export class BenchmarkRunner implements IBenchmarkRunner {
    private storage: InMemoryGraphStorage;

    constructor() {
        this.storage = new InMemoryGraphStorage();
    }

    private async loadConversation(conversation: BenchmarkConversation): Promise<void> {
        // First, create all entity nodes
        const entityIds = new Set<string>();
        for (const message of conversation.messages) {
            if (message.metadata?.entities) {
                for (const entityId of message.metadata.entities) {
                    if (!entityIds.has(entityId)) {
                        entityIds.add(entityId);
                        await this.storage.addNode({
                            id: entityId,
                            type: GraphNodeType.ENTITY,
                            content: { name: entityId },
                            metadata: new Map(),
                            createdAt: new Date(),
                            validAt: message.timestamp
                        });
                    }
                }
            }
        }

        // Then create episode nodes and their entity edges
        for (const message of conversation.messages) {
            // Convert metadata to Map
            const metadata = message.metadata ? 
                new Map(Object.entries(
                    // Remove entities from metadata as they're handled via edges
                    Object.fromEntries(
                        Object.entries(message.metadata)
                            .filter(([key]) => key !== 'entities')
                    )
                )) : new Map();

            const node: IGraphNode = {
                id: message.id,
                type: GraphNodeType.EPISODE,
                content: {
                    body: message.content,
                    embedding: message.embedding,
                    source: 'benchmark',
                    sourceDescription: conversation.id,
                    timestamp: message.timestamp
                },
                metadata,
                createdAt: new Date(),
                validAt: message.timestamp
            };
            await this.storage.addNode(node);

            // Create edges to entities
            if (message.metadata?.entities) {
                for (const entityId of message.metadata.entities) {
                    await this.storage.addEdge({
                        id: `${message.id}_${entityId}`,
                        type: 'references',
                        sourceId: message.id,
                        targetId: entityId,
                        content: {},
                        metadata: new Map(),
                        createdAt: new Date(),
                        validAt: message.timestamp
                    });
                }
            }
        }
    }

    private calculateMetrics(expectedIds: string[], actualNodes: IGraphNode[], startTime: number): BenchmarkMetrics {
        const actualIds = actualNodes.map(n => n.id);
        const expectedSet = new Set(expectedIds);

        // Calculate precision
        const truePositives = actualNodes.filter(n => expectedSet.has(n.id)).length;
        const precision = actualIds.length > 0 ? truePositives / actualIds.length : 0;

        // Calculate recall
        const recall = expectedSet.size > 0 ? truePositives / expectedSet.size : 0;

        // Calculate F1 score
        const f1Score = precision && recall ? 
            2 * (precision * recall) / (precision + recall) : 0;

        // Calculate MRR (Mean Reciprocal Rank)
        let mrr = 0;
        for (let i = 0; i < actualNodes.length; i++) {
            if (expectedSet.has(actualNodes[i].id)) {
                mrr = 1 / (i + 1);
                break;
            }
        }

        return {
            precision,
            recall,
            f1Score,
            mrr,
            latencyMs: Date.now() - startTime,
            retrievedIds: actualIds
        };
    }

    public async runBenchmark(conversation: BenchmarkConversation): Promise<BenchmarkMetrics[]> {
        await this.loadConversation(conversation);
        const results: BenchmarkMetrics[] = [];

        for (const query of conversation.queries) {
            const startTime = Date.now();
            
            // Convert metadata to Map if present
            const metadata = query.metadata ? 
                new Map(Object.entries(query.metadata)) : undefined;
            
            const queryResult = await this.storage.query({
                // Add semantic search parameters if embedding is present
                ...(query.embedding ? {
                    embedding: query.embedding,
                    similarityThreshold: 0.7
                } : {}),
                // Add metadata filters
                ...(metadata ? { metadata } : {}),
                // Add temporal filters if present in metadata
                ...(query.metadata?.temporal ? {
                    temporal: query.metadata.temporal
                } : {}),
                // Ensure we're looking at episode nodes
                nodeTypes: [GraphNodeType.EPISODE],
                // If entities are specified, use episode filter
                ...(query.metadata?.entities ? {
                    episode: {
                        entityIds: query.metadata.entities
                    }
                } : {})
            });

            results.push(this.calculateMetrics(
                query.expectedResults,
                queryResult.nodes,
                startTime
            ));
        }

        return results;
    }
}
