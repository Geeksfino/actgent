import { createHash } from 'crypto';
import { IdGenerator } from './IdGenerator';
import { IGraphNode, IGraphEdge, GraphNodeType, EntityType } from '../data/types';
import { normalizeEntityContent } from './entity';

/**
 * Generates deterministic IDs using SHA-256 hashing with UUID fallback
 */
export class DeterministicIdGenerator implements IdGenerator {
    private usedHashes = new Set<string>();

    /**
     * Normalizes content for consistent hashing
     */
    normalizeContent(content: any): string {
        if (typeof content === 'string') {
            return content.toLowerCase().trim();
        }
        
        if (content === null || content === undefined) {
            return '';
        }

        if (typeof content === 'object') {
            // Sort keys to ensure consistent ordering
            const sortedKeys = Object.keys(content).sort();
            return sortedKeys
                .map(key => {
                    const value = content[key];
                    return `${key}:${this.normalizeContent(value)}`;
                })
                .join('|');
        }

        return String(content);
    }

    /**
     * Generates a hash for the given content with an optional prefix
     */
    private generateHash(content: any, prefix: string = ''): string {
        const normalized = this.normalizeContent(content);
        const hash = createHash('sha256')
            .update(normalized)
            .digest('hex')
            .slice(0, 32); // Use first 32 chars for readability
        
        return prefix ? `${prefix}_${hash}` : hash;
    }

    /**
     * Generates a node ID based on the provided node data
     */
    generateNodeId(node: Partial<IGraphNode>): string {
        if (!node.content) {
            throw new Error('Node content is required for ID generation');
        }

        // Special handling for episode nodes
        if (node.type === GraphNodeType.EPISODE) {
            const content = node.content as any;
            return `ep_${content.sessionId}_${content.turn_id || Date.now()}`;
        }

        // For entity nodes, normalize content first
        const entityTypes = Object.values(GraphNodeType.ENTITY);
        const isEntityType = (type: string | undefined): type is EntityType => 
            type !== undefined && entityTypes.includes(type as EntityType);

        if (isEntityType(node.type)) {
            const normalized = normalizeEntityContent(node.content);
            const prefix = normalized.type.split('.')[1] || 'entity';
            const hash = this.generateHash(normalized, prefix);
            
            // Handle hash collisions
            let finalHash = hash;
            let counter = 0;
            while (this.usedHashes.has(finalHash)) {
                counter++;
                finalHash = this.generateHash(`${hash}_${counter}`);
            }
            
            this.usedHashes.add(finalHash);
            return finalHash;
        }

        // For other node types
        const prefix = node.type || 'node';
        return this.generateHash(node.content, prefix);
    }

    /**
     * Generates an edge ID based on the provided edge data
     */
    generateEdgeId(edge: Partial<IGraphEdge>): string {
        if (!edge.sourceId || !edge.targetId || !edge.type) {
            throw new Error('Edge requires sourceId, targetId, and type for ID generation');
        }

        const edgeContent = {
            source: edge.sourceId,
            target: edge.targetId,
            type: edge.type,
            content: edge.content
        };

        return this.generateHash(edgeContent, 'rel');
    }
}
