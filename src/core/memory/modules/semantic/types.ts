import { IMemoryUnit, MemoryType } from '../../base';

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
    USED_FOR = 'USED_FOR'   // Functional relationship (e.g., "knife" USED_FOR "cutting")
}

/**
 * Represents a node in the concept graph
 */
export class ConceptNode {
    id: string;
    name: string;
    label?: string;
    confidence: number;
    source: string;
    lastVerified: Date;
    properties: Map<string, any>;

    constructor(id: string, name: string, confidence: number, source: string, lastVerified: Date, properties: Map<string, any>) {
        this.id = id;
        this.name = name;
        this.confidence = confidence;
        this.source = source;
        this.lastVerified = lastVerified;
        this.properties = properties;
    }
}

/**
 * Represents a relationship between two concepts
 */
export class ConceptRelation {
    id: string;
    sourceId: string;
    targetId: string;
    type: RelationType;
    weight: number;
    confidence: number;

    constructor(id: string, sourceId: string, targetId: string, type: RelationType, weight: number, confidence: number) {
        this.id = id;
        this.sourceId = sourceId;
        this.targetId = targetId;
        this.type = type;
        this.weight = weight;
        this.confidence = confidence;
    }
}

/**
 * Interface for concept nodes in the semantic network
 */
export interface ConceptNode {
    id: string;
    name: string;
    type: string;
    confidence: number;
    source: string;
    lastVerified: Date;
    properties: Map<string, any>;
}

/**
 * Interface for relationships between concepts
 */
export interface ConceptRelation {
    id: string;
    sourceId: string;
    targetId: string;
    type: RelationType;
    weight: number;
    confidence: number;
    properties: Map<string, any>;
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

/**
 * Interface for semantic memory units
 */
export interface ISemanticMemoryUnit extends IMemoryUnit {
    /** Memory type */
    memoryType: MemoryType.SEMANTIC;
    /** Timestamp when this unit was created */
    timestamp: Date;
    /** Memory metadata */
    metadata: Map<string, any>;
    /** The concept or relationship being stored */
    content: ConceptNode | ConceptRelation;
}

/**
 * Create semantic memory metadata
 */
export function createSemanticMetadata(timestamp: Date): Map<string, any> {
    const metadata = new Map<string, any>();
    metadata.set('type', MemoryType.SEMANTIC);
    metadata.set('timestamp', timestamp);
    return metadata;
}
