import { IGraphNode } from '../data/types';
import { GraphLLMProcessor } from '../processing/llm/processor';
import { SearchResult } from '../processing/llm/types';
import { GraphTask } from '../types';
import { IReranker, RerankerConfig, RerankResult } from './types';

/**
 * LLM-based reranker implementation
 */
export class LLMReranker implements IReranker {
    constructor(
        private llm: GraphLLMProcessor,
        private config: RerankerConfig = {}
    ) {}

    /**
     * Rerank nodes based on query using LLM
     */
    async rerank(query: string, nodes: IGraphNode[]): Promise<RerankResult[]> {
        // Convert nodes to search inputs
        const searchInputs = nodes.map(node => ({
            nodeId: node.id,
            content: node.content,
            metadata: Object.fromEntries(node.metadata)
        }));

        // Get reranked results
        const results = await this.llm.process<SearchResult[]>(
            GraphTask.RERANK_RESULTS,
            {
                query,
                nodes: searchInputs,
                config: this.config
            }
        );

        // Convert to RerankResult format
        return results
            .sort((a, b) => b.score - a.score)
            .map(result => ({
                id: result.nodeId,
                score: result.score,
                explanation: result.explanation
            }));
    }

    /**
     * Get explanation for a specific result
     */
    async explain(query: string, node: IGraphNode): Promise<string> {
        const results = await this.rerank(query, [node]);
        return results[0]?.explanation || 'No explanation available';
    }
}
