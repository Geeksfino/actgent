import { IGraphNode, IGraphEdge } from '../../data/types';
import { GraphLLMProcessor } from '../episodic/processor';
import { CommunityResult } from '../episodic/types';
import { GraphTask } from '../../types';
import { LabelPropagation } from './label_propagation';

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
 * Community metadata
 */
export interface CommunityMeta {
    summary: string;
    lastUpdateTime: Date;
    memberCount: number;
    divergenceScore: number;
}

/**
 * Community detection processor
 */
export class CommunityDetector {
    private labelPropagation: LabelPropagation;
    private communityMeta: Map<string, CommunityMeta>;

    constructor(
        private llm: GraphLLMProcessor,
        private options: CommunityOptions = DEFAULT_OPTIONS
    ) {
        this.labelPropagation = new LabelPropagation();
        this.communityMeta = new Map();
    }

    /**
     * Detect communities in a set of nodes
     */
    async detectCommunities(nodes: IGraphNode[], edges: IGraphEdge[]): Promise<Community[]> {
        // Use label propagation to find initial communities
        const communityGroups = await this.labelPropagation.detectCommunities(
            nodes,
            edges,
            10, // maxIterations
            0.01 // convergenceThreshold
        );

        const communities: Community[] = [];

        // Process each community group
        for (const [_, communityNodes] of communityGroups) {
            // Skip communities that don't meet size requirements
            if (communityNodes.length < this.options.minSize! || 
                communityNodes.length > this.options.maxSize!) {
                continue;
            }

            // Generate community label using LLM
            const result = await this.llm.process<CommunityResult>(
                GraphTask.LABEL_COMMUNITY,
                {
                    nodes: communityNodes.map(node => ({
                        id: node.id,
                        content: node.content
                    }))
                }
            );

            communities.push({
                nodes: communityNodes,
                label: result.label,
                confidence: result.confidence
            });
        }

        return communities;
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

    /**
     * Update community assignment for a new or existing node
     */
    async updateNodeCommunity(
        node: IGraphNode,
        edges: IGraphEdge[]
    ): Promise<{
        communityId: string;
        divergenceScore: number;
    }> {
        const result = await this.labelPropagation.updateNodeCommunity(node, edges);
        
        // Update community metadata
        const meta = this.communityMeta.get(result.communityId) || {
            summary: '',
            lastUpdateTime: new Date(),
            memberCount: 0,
            divergenceScore: 0
        };
        
        meta.lastUpdateTime = new Date();
        meta.memberCount++;
        meta.divergenceScore = result.divergenceScore;
        
        this.communityMeta.set(result.communityId, meta);
        
        return result;
    }

    /**
     * Refresh a specific community using label propagation
     */
    async refreshCommunity(communityId: string): Promise<void> {
        const meta = this.communityMeta.get(communityId);
        if (!meta) {
            throw new Error(`Community ${communityId} not found`);
        }

        // Run label propagation on community subgraph
        const newCommunities = await this.labelPropagation.detectCommunities(
            // TODO: Get community nodes and edges from storage
            [], [], // Placeholder until we implement storage access
            10,    // maxIterations
            0.01   // convergenceThreshold
        );

        // Update metadata
        meta.lastUpdateTime = new Date();
        meta.divergenceScore = 0; // Reset after refresh
        this.communityMeta.set(communityId, meta);
    }

    /**
     * Get metadata for a community
     */
    async getCommunityMeta(communityId: string): Promise<CommunityMeta> {
        const meta = this.communityMeta.get(communityId);
        if (!meta) {
            throw new Error(`Community ${communityId} not found`);
        }
        return meta;
    }

    /**
     * Get current divergence score for a community
     */
    async getCommunityDivergence(communityId: string): Promise<number> {
        const meta = this.communityMeta.get(communityId);
        if (!meta) {
            throw new Error(`Community ${communityId} not found`);
        }
        return meta.divergenceScore;
    }

    /**
     * Get all communities that need refresh
     */
    async getCommunitiesNeedingRefresh(threshold: number): Promise<string[]> {
        const needRefresh: string[] = [];
        
        for (const [id, meta] of this.communityMeta.entries()) {
            if (meta.divergenceScore > threshold) {
                needRefresh.push(id);
            }
        }
        
        return needRefresh;
    }

    /**
     * Generate or update community summary using map-reduce
     */
    private async updateCommunitySummary(
        communityId: string,
        nodes: IGraphNode[]
    ): Promise<string> {
        // 1. Map: Break nodes into chunks
        const chunks = this.chunkNodes(nodes, 5); // 5 nodes per chunk

        // 2. First reduce: Summarize chunks
        const chunkSummaries = await Promise.all(
            chunks.map(chunk => this.llm.process<{ summary: string }>(
                GraphTask.SUMMARIZE_CHUNK,
                { nodes: chunk }
            ))
        );

        // 3. Final reduce: Combine summaries
        const result = await this.llm.process<{ summary: string }>(
            GraphTask.COMBINE_SUMMARIES,
            { summaries: chunkSummaries.map(s => s.summary) }
        );

        return result.summary;
    }

    /**
     * Helper to chunk nodes for parallel processing
     */
    private chunkNodes(nodes: IGraphNode[], size: number): IGraphNode[][] {
        const chunks: IGraphNode[][] = [];
        for (let i = 0; i < nodes.length; i += size) {
            chunks.push(nodes.slice(i, i + size));
        }
        return chunks;
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
