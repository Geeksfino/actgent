import { IConceptGraph, ConceptNode, ConceptRelation, RelationType } from './types';
import crypto from 'crypto';

/**
 * In-memory implementation of a concept graph for semantic memory
 */
export class ConceptGraph implements IConceptGraph {
    private nodes: Map<string, ConceptNode> = new Map();
    private relations: Map<string, ConceptRelation> = new Map();
    private adjacencyList: Map<string, Set<string>> = new Map();

    async addNode(node: ConceptNode): Promise<void> {
        // Ensure node has an ID
        if (!node.id) {
            node.id = crypto.randomUUID();
        }

        // Initialize adjacency list for this node
        if (!this.adjacencyList.has(node.id)) {
            this.adjacencyList.set(node.id, new Set());
        }

        this.nodes.set(node.id, { ...node });
    }

    async addRelation(relation: ConceptRelation): Promise<void> {
        // Ensure relation has an ID
        if (!relation.id) {
            relation.id = crypto.randomUUID();
        }

        // Verify that both nodes exist
        if (!this.nodes.has(relation.sourceId) || !this.nodes.has(relation.targetId)) {
            throw new Error('Source or target node does not exist');
        }

        // Add to relations map
        this.relations.set(relation.id, { ...relation });

        // Update adjacency list
        this.adjacencyList.get(relation.sourceId)?.add(relation.targetId);
        
        // For bidirectional relationships like SIMILAR_TO, add reverse edge
        if (relation.type === RelationType.SIMILAR_TO || 
            relation.type === RelationType.RELATED_TO) {
            this.adjacencyList.get(relation.targetId)?.add(relation.sourceId);
        }
    }

    async getNode(id: string): Promise<ConceptNode | null> {
        return this.nodes.get(id) || null;
    }

    async getRelations(nodeId: string): Promise<ConceptRelation[]> {
        const relations: ConceptRelation[] = [];
        for (const relation of this.relations.values()) {
            if (relation.sourceId === nodeId || relation.targetId === nodeId) {
                relations.push({ ...relation });
            }
        }
        return relations;
    }

    async updateNode(node: ConceptNode): Promise<void> {
        if (!this.nodes.has(node.id)) {
            throw new Error(`Node with id ${node.id} not found`);
        }
        this.nodes.set(node.id, { ...node });
    }

    async updateRelation(relation: ConceptRelation): Promise<void> {
        if (!this.relations.has(relation.id)) {
            throw new Error(`Relation with id ${relation.id} not found`);
        }
        this.relations.set(relation.id, { ...relation });
    }

    async deleteNode(id: string): Promise<void> {
        // Remove all relations involving this node
        for (const relation of this.relations.values()) {
            if (relation.sourceId === id || relation.targetId === id) {
                await this.deleteRelation(relation.id);
            }
        }

        // Remove from adjacency list
        this.adjacencyList.delete(id);
        for (const neighbors of this.adjacencyList.values()) {
            neighbors.delete(id);
        }

        // Remove the node
        this.nodes.delete(id);
    }

    async deleteRelation(id: string): Promise<void> {
        const relation = this.relations.get(id);
        if (relation) {
            // Update adjacency list
            this.adjacencyList.get(relation.sourceId)?.delete(relation.targetId);
            if (relation.type === RelationType.SIMILAR_TO || 
                relation.type === RelationType.RELATED_TO) {
                this.adjacencyList.get(relation.targetId)?.delete(relation.sourceId);
            }
        }
        this.relations.delete(id);
    }

    async findNodes(query: string): Promise<ConceptNode[]> {
        const results: ConceptNode[] = [];
        const queryLower = query.toLowerCase();

        for (const node of this.nodes.values()) {
            if (node.label.toLowerCase().includes(queryLower) ||
                node.type.toLowerCase().includes(queryLower)) {
                results.push({ ...node });
            }
        }

        return results;
    }

    async findPath(sourceId: string, targetId: string): Promise<ConceptRelation[]> {
        if (!this.nodes.has(sourceId) || !this.nodes.has(targetId)) {
            throw new Error('Source or target node does not exist');
        }

        // Use BFS to find shortest path
        const queue: { nodeId: string; path: ConceptRelation[] }[] = [{ nodeId: sourceId, path: [] }];
        const visited = new Set<string>([sourceId]);

        while (queue.length > 0) {
            const { nodeId, path } = queue.shift()!;

            // Check all relations from this node
            const neighbors = this.adjacencyList.get(nodeId) || new Set();
            for (const neighborId of neighbors) {
                if (neighborId === targetId) {
                    // Found the target, construct the final path
                    const relation = Array.from(this.relations.values())
                        .find(r => r.sourceId === nodeId && r.targetId === neighborId);
                    return [...path, relation!];
                }

                if (!visited.has(neighborId)) {
                    visited.add(neighborId);
                    const relation = Array.from(this.relations.values())
                        .find(r => r.sourceId === nodeId && r.targetId === neighborId);
                    queue.push({
                        nodeId: neighborId,
                        path: [...path, relation!]
                    });
                }
            }
        }

        return []; // No path found
    }

    async getMostConfident(nodeIds: string[]): Promise<ConceptNode> {
        let mostConfident: ConceptNode | null = null;

        for (const id of nodeIds) {
            const node = await this.getNode(id);
            if (node && (!mostConfident || node.confidence > mostConfident.confidence)) {
                mostConfident = node;
            }
        }

        if (!mostConfident) {
            throw new Error('No valid nodes found');
        }

        return mostConfident;
    }

    async merge(source: ConceptNode, target: ConceptNode): Promise<ConceptNode> {
        // Create a new node combining properties of both
        const mergedNode: ConceptNode = {
            id: target.id,
            label: target.confidence >= source.confidence ? target.label : source.label,
            type: target.type,
            properties: new Map([...source.properties, ...target.properties]),
            confidence: Math.max(source.confidence, target.confidence),
            lastUpdated: new Date(),
            source: [...new Set([...source.source, ...target.source])]
        };

        // Update the node
        await this.updateNode(mergedNode);

        // Redirect all relations from source to target
        const sourceRelations = await this.getRelations(source.id);
        for (const relation of sourceRelations) {
            if (relation.sourceId === source.id) {
                await this.addRelation({
                    ...relation,
                    id: crypto.randomUUID(),
                    sourceId: target.id,
                    confidence: Math.max(relation.confidence, 0.8) // Boost confidence for verified relations
                });
            } else {
                await this.addRelation({
                    ...relation,
                    id: crypto.randomUUID(),
                    targetId: target.id,
                    confidence: Math.max(relation.confidence, 0.8)
                });
            }
        }

        // Delete the source node and its relations
        await this.deleteNode(source.id);

        return mergedNode;
    }
}
