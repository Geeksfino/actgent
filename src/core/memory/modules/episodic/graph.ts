import { IGraphNode, IGraphEdge } from '../../graph/data/types';
import { MemoryType } from '../../base';
import { IEpisodicMemoryUnit } from './types';
import { EmotionalContext } from '../../context';

/**
 * Graph node types for episodic memory
 */
export enum EpisodicNodeType {
    EPISODE = 'episode',
    LOCATION = 'location',
    ACTOR = 'actor',
    ACTION = 'action'
}

/**
 * Graph edge types for episodic memory relationships
 */
export enum EpisodicEdgeType {
    HAPPENED_AT = 'happened_at',      // Episode -> Location
    INVOLVES = 'involves',            // Episode -> Actor
    CONTAINS = 'contains',            // Episode -> Action
    FOLLOWS = 'follows',              // Episode -> Episode (temporal)
    RELATED_TO = 'related_to',        // Episode -> Episode (semantic)
    CONSOLIDATED_FROM = 'consolidated_from'  // Episode -> Episode (consolidation)
}

/**
 * Base interface for all episodic graph nodes
 */
export interface BaseEpisodicNode extends IGraphNode {
    type: EpisodicNodeType;
    metadata: Map<string, any>;
}

/**
 * Main episode node type
 */
export interface EpisodeNode extends BaseEpisodicNode {
    type: EpisodicNodeType.EPISODE;
    content: {
        timeSequence: number;
        location: string;
        actors: string[];
        actions: string[];
        emotions: EmotionalContext;
        coherenceScore: number;
        emotionalIntensity: number;
        contextualRelevance: number;
        temporalDistance: number;
        userInstruction?: string;
    };
    edges: IGraphEdge[];
}

/**
 * Location node type
 */
export interface LocationNode extends BaseEpisodicNode {
    type: EpisodicNodeType.LOCATION;
    content: {
        name: string;
    };
}

/**
 * Actor node type
 */
export interface ActorNode extends BaseEpisodicNode {
    type: EpisodicNodeType.ACTOR;
    content: {
        name: string;
    };
}

/**
 * Action node type
 */
export interface ActionNode extends BaseEpisodicNode {
    type: EpisodicNodeType.ACTION;
    content: {
        name: string;
        description?: string;
    };
}

/**
 * Edge type for episodic memory relationships
 */
export interface EpisodicEdge extends IGraphEdge {
    type: EpisodicEdgeType;
    metadata: Map<string, any>;
}

/**
 * Result type for episode consolidation
 */
export interface ConsolidationResult extends IEpisodicMemoryUnit {
    sourceEpisodeIds: string[];  // IDs of episodes that were consolidated
}

/**
 * Convert a memory unit to a graph node
 */
export function memoryUnitToGraphNode(unit: IEpisodicMemoryUnit): EpisodeNode {
    const metadata = new Map<string, any>([
        ['id', unit.id],
        ['memoryType', unit.memoryType],
        ['createdAt', unit.createdAt],
        ['validAt', unit.validAt],
        ['expiredAt', unit.expiredAt],
        ['invalidAt', unit.invalidAt],
        ['accessCount', unit.accessCount],
        ['lastAccessed', unit.lastAccessed],
        ['priority', unit.priority]
    ]);
    
    // Add any additional metadata from the unit
    for (const [key, value] of unit.metadata) {
        metadata.set(key, value);
    }

    return {
        id: unit.id,
        type: EpisodicNodeType.EPISODE,
        createdAt: unit.createdAt,
        content: {
            timeSequence: unit.content.timeSequence,
            location: unit.content.location,
            actors: unit.content.actors,
            actions: unit.content.actions,
            emotions: unit.content.emotions,
            coherenceScore: unit.content.coherenceScore,
            emotionalIntensity: unit.content.emotionalIntensity,
            contextualRelevance: unit.content.contextualRelevance,
            temporalDistance: unit.content.temporalDistance,
            userInstruction: unit.content.userInstruction
        },
        metadata,
        edges: []
    };
}

/**
 * Convert a graph node back to a memory unit
 */
export function graphNodeToMemoryUnit(node: EpisodeNode): IEpisodicMemoryUnit {
    const { metadata, content } = node;
    return {
        id: metadata.get('id'),
        content: {
            ...content,
            timestamp: metadata.get('createdAt'),
            consolidationStatus: metadata.get('consolidationStatus'),
            originalMemories: metadata.get('originalMemories'),
            relatedTo: metadata.get('relatedTo')
        },
        metadata: new Map(metadata), // Create a new Map from the existing one
        timestamp: metadata.get('createdAt'),
        memoryType: metadata.get('memoryType'),
        createdAt: metadata.get('createdAt'),
        validAt: metadata.get('validAt'),
        expiredAt: metadata.get('expiredAt'),
        invalidAt: metadata.get('invalidAt'),
        accessCount: metadata.get('accessCount'),
        lastAccessed: metadata.get('lastAccessed'),
        priority: metadata.get('priority')
    };
}
