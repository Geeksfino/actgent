import { IMemoryUnit } from '../types';

/**
 * Types of semantic relationships between concepts
 */
export enum RelationType {
    IS_A = 'IS_A',           // Hierarchical relationship (e.g., "cat" IS_A "animal")
    HAS_A = 'HAS_A',         // Compositional relationship (e.g., "car" HAS_A "wheel")
    PART_OF = 'PART_OF',     // Part-whole relationship (e.g., "wheel" PART_OF "car")
    RELATED_TO = 'RELATED_TO', // General association (e.g., "rain" RELATED_TO "umbrella")
    SIMILAR_TO = 'SIMILAR_TO', // Similarity relationship (e.g., "happy" SIMILAR_TO "joyful")
    OPPOSITE_OF = 'OPPOSITE_OF', // Antonym relationship (e.g., "hot" OPPOSITE_OF "cold")
    CAUSES = 'CAUSES',       // Causal relationship (e.g., "rain" CAUSES "wet")
    PRECEDED_BY = 'PRECEDED_BY', // Temporal relationship (e.g., "dinner" PRECEDED_BY "cooking")
    FOLLOWED_BY = 'FOLLOWED_BY', // Temporal relationship (e.g., "cooking" FOLLOWED_BY "eating")
    USED_FOR = 'USED_FOR',   // Functional relationship (e.g., "knife" USED_FOR "cutting")
}

/**
 * Represents a node in the concept graph
 */
export interface ConceptNode {
    id: string;
    label: string;
    type: string;
    properties: Map<string, any>;
    confidence: number;
    lastUpdated: Date;
    source: string[];  // References to source memories
}

/**
 * Represents a relationship between two concepts
 */
export interface ConceptRelation {
    id: string;
    sourceId: string;
    targetId: string;
    type: RelationType;
    properties: Map<string, any>;
    confidence: number;
    lastUpdated: Date;
    source: string[];  // References to source memories
}

/**
 * Interface for the concept graph
 */
export interface IConceptGraph {
    addNode(node: ConceptNode): Promise<void>;
    addRelation(relation: ConceptRelation): Promise<void>;
    getNode(id: string): Promise<ConceptNode | null>;
    getRelations(nodeId: string): Promise<ConceptRelation[]>;
    updateNode(node: ConceptNode): Promise<void>;
    updateRelation(relation: ConceptRelation): Promise<void>;
    deleteNode(id: string): Promise<void>;
    deleteRelation(id: string): Promise<void>;
    findNodes(query: string): Promise<ConceptNode[]>;
    findPath(sourceId: string, targetId: string): Promise<ConceptRelation[]>;
    getMostConfident(nodeIds: string[]): Promise<ConceptNode>;
    merge(source: ConceptNode, target: ConceptNode): Promise<ConceptNode>;
}

/**
 * Interface for semantic memory operations
 */
export interface ISemanticMemory {
    store(memory: IMemoryUnit): Promise<void>;
    retrieve(query: string): Promise<IMemoryUnit[]>;
    update(memory: IMemoryUnit): Promise<void>;
    delete(id: string): Promise<void>;
    findConcepts(query: string): Promise<ConceptNode[]>;
    findRelations(conceptId: string): Promise<ConceptRelation[]>;
    mergeConcepts(sourceId: string, targetId: string): Promise<void>;
    getConceptGraph(): IConceptGraph;
}
