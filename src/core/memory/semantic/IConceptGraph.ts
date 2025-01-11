import { ConceptNode, ConceptRelation } from '../types';

/**
 * Interface for concept graph operations
 */
export interface IConceptGraph {
    /**
     * Add a node to the graph
     */
    addNode(node: ConceptNode): Promise<void>;

    /**
     * Add a relation between nodes
     */
    addRelation(relation: ConceptRelation): Promise<void>;

    /**
     * Get a specific node by ID
     */
    getNode(id: string): Promise<ConceptNode | null>;

    /**
     * Get a specific relation by source and target IDs
     */
    getRelation(sourceId: string, targetId: string): Promise<ConceptRelation | null>;

    /**
     * Get nodes connected to the given node
     */
    getNeighbors(concept: string): Promise<ConceptNode[]>;

    /**
     * Get all relations for a given node
     */
    getRelations(concept: string): Promise<ConceptRelation[]>;

    /**
     * Get all relations for a given node
     */
    getNodeRelations(nodeId: string): Promise<ConceptRelation[]>;

    /**
     * Find concepts matching a pattern
     */
    findConcepts(pattern: string): Promise<ConceptNode[]>;

    /**
     * Find relations matching criteria
     */
    findRelations(criteria: {
        type?: string;
        source?: string;
        target?: string;
    }): Promise<ConceptRelation[]>;

    /**
     * Get all nodes in the graph
     */
    getAllNodes(): Promise<ConceptNode[]>;

    /**
     * Get all relations in the graph
     */
    getAllRelations(): Promise<ConceptRelation[]>;

    /**
     * Find the shortest path between two concepts
     */
    findPath(source: string, target: string): Promise<ConceptNode[]>;

    /**
     * Delete a node and all its relations
     */
    deleteNode(id: string): Promise<void>;

    /**
     * Delete a relation between nodes
     */
    deleteRelation(relation: ConceptRelation): Promise<void>;

    /**
     * Clear the entire graph
     */
    clear(): Promise<void>;
}
