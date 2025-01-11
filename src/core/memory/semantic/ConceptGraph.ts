import { IConceptGraph } from './IConceptGraph';
import { ConceptNode, ConceptRelation, RelationType } from '../types';
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

    async getRelation(sourceId: string, targetId: string): Promise<ConceptRelation | null> {
        for (const relation of this.relations.values()) {
            if (relation.sourceId === sourceId && relation.targetId === targetId) {
                return relation;
            }
        }
        return null;
    }

    async getNeighbors(concept: string): Promise<ConceptNode[]> {
        const neighbors: ConceptNode[] = [];
        const neighborIds = this.adjacencyList.get(concept);
        if (neighborIds) {
            for (const id of neighborIds) {
                const node = await this.getNode(id);
                if (node) {
                    neighbors.push(node);
                }
            }
        }
        return neighbors;
    }

    async getRelations(concept: string): Promise<ConceptRelation[]> {
        return this.getNodeRelations(concept);
    }

    async getNodeRelations(nodeId: string): Promise<ConceptRelation[]> {
        const relations: ConceptRelation[] = [];
        for (const relation of this.relations.values()) {
            if (relation.sourceId === nodeId || relation.targetId === nodeId) {
                relations.push({ ...relation });
            }
        }
        return relations;
    }

    async findConcepts(pattern: string): Promise<ConceptNode[]> {
        const regex = new RegExp(pattern, 'i');
        return Array.from(this.nodes.values()).filter(
            node => regex.test(node.name) || (node.label && regex.test(node.label))
        );
    }

    async findRelations(criteria: {
        type?: string;
        source?: string;
        target?: string;
    }): Promise<ConceptRelation[]> {
        return Array.from(this.relations.values()).filter(relation => {
            if (criteria.type && relation.type !== criteria.type) return false;
            if (criteria.source && relation.sourceId !== criteria.source) return false;
            if (criteria.target && relation.targetId !== criteria.target) return false;
            return true;
        });
    }

    async getAllNodes(): Promise<ConceptNode[]> {
        return Array.from(this.nodes.values());
    }

    async getAllRelations(): Promise<ConceptRelation[]> {
        return Array.from(this.relations.values());
    }

    async findPath(source: string, target: string): Promise<ConceptNode[]> {
        // Simple BFS implementation
        const queue: string[] = [source];
        const visited = new Set<string>();
        const parent = new Map<string, string>();

        while (queue.length > 0) {
            const current = queue.shift()!;
            if (current === target) {
                // Reconstruct path
                const path: string[] = [current];
                let node = current;
                while (parent.has(node)) {
                    node = parent.get(node)!;
                    path.unshift(node);
                }
                return Promise.all(path.map(id => this.getNode(id))).then(
                    nodes => nodes.filter((n): n is ConceptNode => n !== null)
                );
            }

            visited.add(current);
            const neighbors = this.adjacencyList.get(current) || new Set();
            for (const neighbor of neighbors) {
                if (!visited.has(neighbor)) {
                    queue.push(neighbor);
                    parent.set(neighbor, current);
                }
            }
        }

        return [];
    }

    async deleteNode(id: string): Promise<void> {
        // Remove all relations involving this node
        const relations = await this.getNodeRelations(id);
        await Promise.all(relations.map(relation => this.deleteRelation(relation)));

        // Remove from adjacency list
        this.adjacencyList.delete(id);
        for (const neighbors of this.adjacencyList.values()) {
            neighbors.delete(id);
        }

        // Remove the node
        this.nodes.delete(id);
    }

    async deleteRelation(relation: ConceptRelation): Promise<void> {
        this.relations.delete(relation.id);
        
        // Update adjacency list
        this.adjacencyList.get(relation.sourceId)?.delete(relation.targetId);
        if (relation.type === RelationType.SIMILAR_TO || 
            relation.type === RelationType.RELATED_TO) {
            this.adjacencyList.get(relation.targetId)?.delete(relation.sourceId);
        }
    }

    async clear(): Promise<void> {
        this.nodes.clear();
        this.relations.clear();
        this.adjacencyList.clear();
    }
}
