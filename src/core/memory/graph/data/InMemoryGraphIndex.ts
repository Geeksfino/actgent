import { IGraphIndex, IGraphNode, IGraphEdge } from './types';

/**
 * In-memory implementation of graph indexing operations
 */
export class InMemoryGraphIndex<N = any, E = any> implements IGraphIndex<N, E> {
    private nodeEmbeddings: Map<string, number[]> = new Map();
    private nodeMetadata: Map<string, Record<string, any>> = new Map();
    private edgeMetadata: Map<string, Record<string, any>> = new Map();

    async indexNode(node: IGraphNode<N>): Promise<void> {
        if (node.embedding) {
            this.nodeEmbeddings.set(node.id, node.embedding);
        }
        if (node.metadata) {
            this.nodeMetadata.set(node.id, Object.fromEntries(node.metadata));
        }
    }

    async indexEdge(edge: IGraphEdge<E>): Promise<void> {
        if (edge.metadata) {
            this.edgeMetadata.set(edge.id, Object.fromEntries(edge.metadata));
        }
    }

    async searchByEmbedding(embedding: number[]): Promise<string[]> {
        // Simple cosine similarity search
        const results: [string, number][] = [];
        
        for (const [id, nodeEmbedding] of this.nodeEmbeddings.entries()) {
            const similarity = this.cosineSimilarity(embedding, nodeEmbedding);
            results.push([id, similarity]);
        }

        // Sort by similarity descending and return IDs
        return results
            .sort((a, b) => b[1] - a[1])
            .map(([id]) => id);
    }

    async searchByMetadata(metadata: Record<string, any>): Promise<string[]> {
        return Array.from(this.nodeMetadata.entries())
            .filter(([_, nodeMetadata]) => this.matchesMetadata(nodeMetadata, metadata))
            .map(([id]) => id);
    }

    private cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) {
            throw new Error('Vectors must have same length');
        }

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

    private matchesMetadata(source: Record<string, any>, query: Record<string, any>): boolean {
        return Object.entries(query).every(([key, value]) => 
            source[key] !== undefined && source[key] === value
        );
    }
}
