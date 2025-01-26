import { GraphLLMProcessor } from '../llm/processor';
import { GraphTask } from '../llm/types';
import { UpdateSearchRanksSchema } from '../llm/types';
import { IReranker, RerankResult, RerankerConfig } from './types';

/**
 * LLM-based reranker implementation
 */
export class LLMReranker implements IReranker {
  constructor(private llm: GraphLLMProcessor) {}

  /**
   * Rerank items using LLM
   */
  async rerank(
    query: string,
    items: Array<{ id: string; content: string }>,
    config?: RerankerConfig
  ): Promise<RerankResult[]> {
    const result = await this.llm.process(
      GraphTask.RERANK_RESULTS,
      {
        query,
        items: items.map(item => ({
          id: item.id,
          content: item.content
        }))
      },
      UpdateSearchRanksSchema
    );

    return result.arguments.ranked_results.map(item => ({
      id: item.id,
      score: item.score,
      explanation: item.relevance_explanation
    }));
  }

  /**
   * Batch reranking for efficiency
   */
  async rerankBatch(
    queries: string[],
    items: Array<{ id: string; content: string }>[],
    config?: RerankerConfig
  ): Promise<RerankResult[][]> {
    return Promise.all(
      queries.map((query, i) => this.rerank(query, items[i], config))
    );
  }
}
