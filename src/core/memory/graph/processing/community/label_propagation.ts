import { IGraphNode, IGraphEdge } from '../../data/types';
import { Community } from './index';

/**
 * Label Propagation Algorithm (LPA) for community detection
 * Based on the paper "Near linear time algorithm to detect community structures in large-scale networks"
 */
export class LabelPropagation {
    private labels: Map<string, string>;

    constructor() {
        this.labels = new Map<string, string>();
    }

    /**
     * Run label propagation algorithm to detect communities
     * @param nodes Graph nodes
     * @param edges Graph edges
     * @param maxIterations Maximum number of iterations (default: 10)
     * @param convergenceThreshold Stop if proportion of nodes changing labels falls below this (default: 0.01)
     */
    async detectCommunities(
        nodes: IGraphNode[],
        edges: IGraphEdge[],
        maxIterations: number = 10,
        convergenceThreshold: number = 0.01
    ): Promise<Map<string, IGraphNode[]>> {
        // Initialize: each node starts in its own community
        nodes.forEach(node => this.labels.set(node.id, node.id));

        // Build adjacency list for efficient neighbor lookup
        const adjacencyList = this.buildAdjacencyList(nodes, edges);

        let iteration = 0;
        let changed = nodes.length; // Initially all nodes "changed" from null
        
        while (iteration < maxIterations && (changed / nodes.length) > convergenceThreshold) {
            changed = 0;
            
            // Randomize node order for each iteration
            const shuffledNodes = this.shuffle([...nodes]);
            
            // Update each node's label
            for (const node of shuffledNodes) {
                const newLabel = this.findDominantLabel(node, adjacencyList, this.labels);
                
                if (newLabel && this.labels.get(node.id) !== newLabel) {
                    this.labels.set(node.id, newLabel);
                    changed++;
                }
            }
            
            iteration++;
        }

        // Group nodes by their final labels
        const communities = new Map<string, IGraphNode[]>();
        nodes.forEach(node => {
            const label = this.labels.get(node.id)!;
            if (!communities.has(label)) {
                communities.set(label, []);
            }
            communities.get(label)!.push(node);
        });

        return communities;
    }

    /**
     * Update community assignment for a single node
     * Uses neighbor plurality voting for efficient updates
     */
    async updateNodeCommunity(
        node: IGraphNode,
        edges: IGraphEdge[]
    ): Promise<{
        communityId: string;
        divergenceScore: number;
    }> {
        // Get neighboring nodes' communities
        const neighborCommunities = edges.map(edge => {
            const neighborId = edge.targetId === node.id ? edge.sourceId : edge.targetId;
            return this.labels.get(neighborId);
        }).filter((label): label is string => label !== undefined);

        if (neighborCommunities.length === 0) {
            // No neighbors, create new community
            const communityId = node.id;
            this.labels.set(node.id, communityId);
            return {
                communityId,
                divergenceScore: 0
            };
        }

        // Count frequency of each community
        const communityCounts = new Map<string, number>();
        neighborCommunities.forEach(community => {
            communityCounts.set(community, (communityCounts.get(community) || 0) + 1);
        });

        // Find plurality community
        let maxCount = 0;
        let pluralityCommunity = '';
        communityCounts.forEach((count, community) => {
            if (count > maxCount) {
                maxCount = count;
                pluralityCommunity = community;
            }
        });

        // Calculate divergence score (0-1)
        // Higher score means more disagreement among neighbors
        const totalNeighbors = neighborCommunities.length;
        const divergenceScore = 1 - (maxCount / totalNeighbors);

        // Update node's community
        this.labels.set(node.id, pluralityCommunity);

        return {
            communityId: pluralityCommunity,
            divergenceScore
        };
    }

    /**
     * Build adjacency list representation of the graph
     */
    private buildAdjacencyList(nodes: IGraphNode[], edges: IGraphEdge[]): Map<string, Set<string>> {
        const adjacencyList = new Map<string, Set<string>>();
        
        // Initialize empty sets for each node
        nodes.forEach(node => adjacencyList.set(node.id, new Set()));
        
        // Add edges to adjacency list
        edges.forEach(edge => {
            adjacencyList.get(edge.sourceId)?.add(edge.targetId);
            adjacencyList.get(edge.targetId)?.add(edge.sourceId);
        });
        
        return adjacencyList;
    }

    /**
     * Find the dominant label among a node's neighbors
     */
    private findDominantLabel(
        node: IGraphNode,
        adjacencyList: Map<string, Set<string>>,
        labels: Map<string, string>
    ): string | null {
        const neighbors = adjacencyList.get(node.id);
        if (!neighbors || neighbors.size === 0) return null;

        // Count frequency of each label among neighbors
        const labelCounts = new Map<string, number>();
        neighbors.forEach(neighborId => {
            const label = labels.get(neighborId);
            if (label) {
                labelCounts.set(label, (labelCounts.get(label) || 0) + 1);
            }
        });

        // Find the most frequent label(s)
        let maxCount = 0;
        const dominantLabels: string[] = [];
        
        labelCounts.forEach((count, label) => {
            if (count > maxCount) {
                maxCount = count;
                dominantLabels.length = 0;
                dominantLabels.push(label);
            } else if (count === maxCount) {
                dominantLabels.push(label);
            }
        });

        // If there are multiple dominant labels, choose one randomly
        return dominantLabels[Math.floor(Math.random() * dominantLabels.length)] || null;
    }

    /**
     * Shuffle array using Fisher-Yates algorithm
     */
    private shuffle<T>(array: T[]): T[] {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }
}
