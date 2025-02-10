import { IGraphNode, IGraphEdge } from '../data/types';

export interface IdGenerator {
    generateNodeId(node: Partial<IGraphNode>): string;
    generateEdgeId(edge: Partial<IGraphEdge>): string;
}
