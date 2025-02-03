import { IBenchmarkRunner } from './base';
import { BenchmarkConversation, BenchmarkMetrics } from './types';

export class GraphitiRunner implements IBenchmarkRunner {
    private nodes: Map<string, any> = new Map();
    private edges: Map<string, any> = new Map();

    private async addNode(node: any): Promise<void> {
        this.nodes.set(node.id, node);
    }

    private async addEdge(edge: any): Promise<void> {
        this.edges.set(edge.id, edge);
    }

    private async query(filter: any): Promise<{ nodes: any[]; edges: any[] }> {
        let nodes = Array.from(this.nodes.values());
        let edges = Array.from(this.edges.values());

        if (filter.metadata?.entities) {
            const entityIds = new Set(filter.metadata.entities);
            nodes = nodes.filter(node => {
                if (!node.metadata?.entities) return false;
                return node.metadata.entities.some((id: string) => entityIds.has(id));
            });
        }

        if (filter.temporal?.validAt) {
            const validAt = new Date(filter.temporal.validAt);
            nodes = nodes.filter(node => {
                const timestamp = new Date(node.timestamp);
                return timestamp <= validAt;
            });
        }

        if (filter.embedding) {
            nodes = nodes.filter(node => node.embedding).sort((a, b) => {
                const distA = this.cosineSimilarity(filter.embedding, a.embedding);
                const distB = this.cosineSimilarity(filter.embedding, b.embedding);
                return distB - distA;
            });
        }

        return { nodes, edges };
    }

    private cosineSimilarity(a: number[], b: number[]): number {
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    private calculateMetrics(expectedIds: string[], actualNodes: any[], startTime: number): BenchmarkMetrics {
        const actualIds = new Set(actualNodes.map(n => n.id));
        const expectedSet = new Set(expectedIds);

        const truePositives = actualNodes.filter(n => expectedSet.has(n.id)).length;
        const precision = actualIds.size > 0 ? truePositives / actualIds.size : 0;
        const recall = expectedSet.size > 0 ? truePositives / expectedSet.size : 0;
        const f1Score = precision && recall ? 
            2 * (precision * recall) / (precision + recall) : 0;

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
            latencyMs: Date.now() - startTime
        };
    }

    public async runBenchmark(conversation: BenchmarkConversation): Promise<BenchmarkMetrics[]> {
        // Reset state
        this.nodes.clear();
        this.edges.clear();

        // Load conversation
        for (const message of conversation.messages) {
            await this.addNode({
                id: message.id,
                content: message.content,
                embedding: message.embedding,
                timestamp: message.timestamp,
                metadata: message.metadata
            });

            if (message.metadata?.entities) {
                for (const entityId of message.metadata.entities) {
                    await this.addNode({
                        id: entityId,
                        type: 'entity',
                        content: { name: entityId },
                        timestamp: message.timestamp
                    });

                    await this.addEdge({
                        id: `${message.id}_${entityId}`,
                        type: 'references',
                        sourceId: message.id,
                        targetId: entityId,
                        timestamp: message.timestamp
                    });
                }
            }
        }

        // Run queries
        const results: BenchmarkMetrics[] = [];
        for (const query of conversation.queries) {
            const startTime = Date.now();
            const queryResult = await this.query({
                embedding: query.embedding,
                metadata: query.metadata,
                temporal: query.metadata?.temporal
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
