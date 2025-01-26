/**
 * Interface for reranking results
 */
export interface RerankResult {
  id: string;
  score: number;
  explanation?: string;
}

/**
 * Configuration for rerankers
 */
export interface RerankerConfig {
  batchSize?: number;
  threshold?: number;
  maxResults?: number;
}

/**
 * Interface for any reranking implementation
 */
export interface IReranker {
  /**
   * Rerank a list of items based on query
   */
  rerank(
    query: string,
    items: Array<{ id: string; content: string }>,
    config?: RerankerConfig
  ): Promise<RerankResult[]>;

  /**
   * Optional batch reranking for efficiency
   */
  rerankBatch?(
    queries: string[],
    items: Array<{ id: string; content: string }>[],
    config?: RerankerConfig
  ): Promise<RerankResult[][]>;
}
