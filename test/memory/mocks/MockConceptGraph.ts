import { IConceptGraph } from '../../../src/core/memory/semantic/IConceptGraph';
import { ConceptNode, ConceptRelation } from '../../../src/core/memory/types';

export class MockConceptGraph implements IConceptGraph {
    private nodes: Map<string, ConceptNode> = new Map();
    private relations: Map<string, ConceptRelation> = new Map();

    async addNode(node: ConceptNode): Promise<void> {
        this.nodes.set(node.id, node);
    }

    async addRelation(relation: ConceptRelation): Promise<void> {
        const key = `${relation.sourceId}-${relation.targetId}`;
        this.relations.set(key, relation);
    }

    async getNode(id: string): Promise<ConceptNode | null> {
        return this.nodes.get(id) || null;
    }

    async getRelation(sourceId: string, targetId: string): Promise<ConceptRelation | null> {
        const key = `${sourceId}-${targetId}`;
        return this.relations.get(key) || null;
    }

    async getNeighbors(concept: string): Promise<ConceptNode[]> {
        const neighbors: ConceptNode[] = [];
        for (const relation of this.relations.values()) {
            if (relation.sourceId === concept) {
                const node = await this.getNode(relation.targetId);
                if (node) neighbors.push(node);
            }
            if (relation.targetId === concept) {
                const node = await this.getNode(relation.sourceId);
                if (node) neighbors.push(node);
            }
        }
        return neighbors;
    }

    async getRelations(concept: string): Promise<ConceptRelation[]> {
        return this.getNodeRelations(concept);
    }

    async getNodeRelations(nodeId: string): Promise<ConceptRelation[]> {
        return Array.from(this.relations.values()).filter(
            r => r.sourceId === nodeId || r.targetId === nodeId
        );
    }

    async findConcepts(pattern: string): Promise<ConceptNode[]> {
        const regex = new RegExp(pattern, 'i');
        return Array.from(this.nodes.values()).filter(
            node => regex.test(node.name)
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
        // Simple BFS implementation for testing
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
            const neighbors = await this.getNeighbors(current);
            for (const neighbor of neighbors) {
                if (!visited.has(neighbor.id)) {
                    queue.push(neighbor.id);
                    parent.set(neighbor.id, current);
                }
            }
        }

        return [];
    }

    async deleteNode(id: string): Promise<void> {
        this.nodes.delete(id);
        // Delete all relations involving this node
        for (const [key, relation] of this.relations.entries()) {
            if (relation.sourceId === id || relation.targetId === id) {
                this.relations.delete(key);
            }
        }
    }

    async deleteRelation(relation: ConceptRelation): Promise<void> {
        const key = `${relation.sourceId}-${relation.targetId}`;
        this.relations.delete(key);
    }

    async clear(): Promise<void> {
        this.nodes.clear();
        this.relations.clear();
    }
}
