import { IGraphNode, IGraphEdge } from '../../data/types';
import { GraphLLMProcessor } from '../llm/processor';
import { GraphTask, CommunityResult } from '../llm/types';

/**
 * Community detection options
 */
export interface CommunityOptions {
    minSize?: number;
    maxSize?: number;
    minSimilarity?: number;
    algorithm?: string;
}

/**
 * Default community detection options
 */
const DEFAULT_OPTIONS: CommunityOptions = {
    minSize: 3,
    maxSize: 50,
    minSimilarity: 0.7,
    algorithm: 'louvain'
};

/**
 * Represents a detected community in the graph
 */
export interface Community {
    nodes: IGraphNode[];
    label: string;
    confidence: number;
}

/**
 * Community detection processor
 */
export class CommunityDetector {
    constructor(
        private llm: GraphLLMProcessor,
        private options: CommunityOptions = DEFAULT_OPTIONS
    ) {}

    /**
     * Detect communities in a set of nodes
     */
    async detectCommunities(nodes: IGraphNode[], edges: IGraphEdge[]): Promise<Community[]> {
        // Convert nodes and edges to format for LLM
        const nodeData = nodes.map(node => ({
            id: node.id,
            content: node.content,
            metadata: Object.fromEntries(node.metadata)
        }));

        const edgeData = edges.map(edge => ({
            sourceId: edge.sourceId,
            targetId: edge.targetId,
            type: edge.type,
            metadata: Object.fromEntries(edge.metadata)
        }));

        // Get community assignments from LLM
        const results = await this.llm.process<CommunityResult[]>(
            GraphTask.REFINE_COMMUNITIES,
            {
                nodes: nodeData,
                edges: edgeData,
                options: this.options
            }
        );

        // Convert results back to communities
        return results.map(result => ({
            nodes: result.nodes
                .map(nodeId => nodes.find(n => n.id === nodeId))
                .filter((n): n is IGraphNode => n !== undefined),
            label: result.label,
            confidence: result.confidence
        }));
    }

    /**
     * Merge overlapping communities
     */
    mergeCommunities(communities: Community[]): Community[] {
        const merged: Community[] = [];
        const used = new Set<string>();

        for (const c1 of communities) {
            if (c1.nodes.some(n => used.has(n.id))) continue;

            let current = c1;
            for (const c2 of communities) {
                if (c1 === c2) continue;
                if (c2.nodes.some(n => used.has(n.id))) continue;

                const overlap = this.calculateOverlap(c1, c2);
                if (overlap >= this.options.minSimilarity!) {
                    current = this.mergeTwoCommunities(current, c2);
                }
            }

            current.nodes.forEach(n => used.add(n.id));
            merged.push(current);
        }

        return merged;
    }

    /**
     * Calculate overlap between two communities
     */
    private calculateOverlap(c1: Community, c2: Community): number {
        const s1 = new Set(c1.nodes.map(n => n.id));
        const s2 = new Set(c2.nodes.map(n => n.id));

        let intersection = 0;
        for (const id of s1) {
            if (s2.has(id)) intersection++;
        }

        return intersection / Math.min(s1.size, s2.size);
    }

    /**
     * Merge two communities into one
     */
    private mergeTwoCommunities(c1: Community, c2: Community): Community {
        const nodeSet = new Set([
            ...c1.nodes.map(n => n.id),
            ...c2.nodes.map(n => n.id)
        ]);

        return {
            nodes: Array.from(nodeSet)
                .map(id => c1.nodes.find(n => n.id === id) || c2.nodes.find(n => n.id === id)!)
                .filter((n): n is IGraphNode => n !== undefined),
            label: c1.confidence > c2.confidence ? c1.label : c2.label,
            confidence: Math.min(c1.confidence, c2.confidence)
        };
    }
}

/**
 * Find top K shortest paths between nodes
 */
export function findTopKPaths(
  start: IGraphNode,
  end: IGraphNode,
  nodes: IGraphNode[],
  edges: IGraphEdge[],
  k: number = 3
): Array<{
  nodes: IGraphNode[];
  edges: IGraphEdge[];
  cost: number;
}> {
  // Implement k-shortest paths algorithm (Yen's algorithm)
  // For now, return simple shortest path
  const path = findShortestPath(start, end, nodes, edges);
  return path ? [path] : [];
}

/**
 * Find shortest path using A* algorithm
 */
function findShortestPath(
  start: IGraphNode,
  end: IGraphNode,
  nodes: IGraphNode[],
  edges: IGraphEdge[]
): { nodes: IGraphNode[]; edges: IGraphEdge[]; cost: number; } | null {
  // Basic A* implementation
  // TODO: Implement proper A* with heuristics
  return {
    nodes: [start, end],
    edges: [],
    cost: 1
  };
}

/**
 * Basic graph traversal utilities
 */
export class GraphTraversal {
  static bfs(
    startNode: IGraphNode,
    nodes: IGraphNode[],
    edges: IGraphEdge[],
    condition: (node: IGraphNode) => boolean
  ): IGraphNode[] {
    const visited = new Set<string>();
    const queue: IGraphNode[] = [startNode];
    const result: IGraphNode[] = [];

    while (queue.length > 0) {
      const node = queue.shift()!;
      if (!visited.has(node.id)) {
        visited.add(node.id);
        if (condition(node)) {
          result.push(node);
        }
        
        // Find connected nodes
        const connectedEdges = edges.filter(e => 
          e.sourceId === node.id || e.targetId === node.id
        );
        for (const edge of connectedEdges) {
          const nextId = edge.sourceId === node.id ? edge.targetId : edge.sourceId;
          const nextNode = nodes.find(n => n.id === nextId);
          if (nextNode && !visited.has(nextId)) {
            queue.push(nextNode);
          }
        }
      }
    }

    return result;
  }
}
