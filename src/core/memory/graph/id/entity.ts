import { IGraphNode, EntityContent, GraphNodeType, EntityType } from '../data/types';

/**
 * Normalizes entity content to ensure consistent structure
 */
export function normalizeEntityContent(content: any): EntityContent {
    if (typeof content === 'string') {
        // Handle simple string content
        return {
            name: content,
            type: GraphNodeType.ENTITY.CONCEPT,
            summary: content
        };
    }

    // Handle LLM-generated content
    if (content.id !== undefined) {
        delete content.id; // Remove numeric IDs from LLM
    }

    // Normalize entity type
    let type = content.type?.toLowerCase() || 'entity.concept';
    if (!type.startsWith('entity.')) {
        type = `entity.${type.toLowerCase()}`;
    }

    // Validate type is a valid entity type
    const validTypes = Object.values(GraphNodeType.ENTITY);
    const normalizedType = validTypes.find(t => t === type) || GraphNodeType.ENTITY.CONCEPT;

    return {
        name: content.name,
        type: normalizedType,
        summary: content.summary,
        metadata: content.metadata || {}
    };
}

/**
 * Normalizes an entity node to ensure consistent structure
 */
export function normalizeEntityNode(node: IGraphNode): IGraphNode<EntityContent> {
    const content = normalizeEntityContent(node.content);
    return {
        ...node,
        type: content.type,
        content
    };
}
