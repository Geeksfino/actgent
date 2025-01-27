import { IGraphNode, GraphFilter, IGraphStorage } from '../data/types';
import { EmbeddingSearch } from './embedding';
import { BM25Search } from './bm25';
import { ResultReranker } from './reranking';

interface SearchResult {
    id: string;
    score: number;
    source: 'embedding' | 'text' | 'hybrid';
}

export interface TemporalSearchResult extends SearchResult {
    timestamp: Date;
    validUntil?: Date;
    validFrom?: Date;
    confidence: number;
}

export interface SearchConfig {
    textWeight: number;      // Weight for BM25 scores
    embeddingWeight: number; // Weight for embedding similarity scores
    minTextScore: number;    // Minimum BM25 score threshold
    minEmbeddingScore: number; // Minimum embedding similarity threshold
    limit: number;           // Maximum number of results to return
    temporal?: {
        asOf?: Date;         // Point-in-time query
        timeWindow?: {       // Time range query
            start: Date;
            end: Date;
        };
        decayRate?: number;  // Time decay factor for scoring (0-1)
    };
}

/**
 * Hybrid search combining BM25 and embedding-based similarity
 */
export class HybridSearch {
    private defaultConfig: SearchConfig = {
        textWeight: 0.4,
        embeddingWeight: 0.6,
        minTextScore: 0.1,
        minEmbeddingScore: 0.5,
        limit: 10
    };

    constructor(
        private embeddingSearch: EmbeddingSearch,
        private textSearch: BM25Search,
        protected config: Partial<SearchConfig> = {}
    ) {
        this.config = { ...this.defaultConfig, ...config };
    }

    /**
     * Index a node for both text and embedding search
     */
    async indexNode(node: IGraphNode, embedding?: number[]): Promise<void> {
        // Index for text search
        const textContent = this.extractTextContent(node);
        this.textSearch.addDocument(node.id, textContent);

        // Index for embedding search if embedding is provided
        if (embedding) {
            this.embeddingSearch.addEmbedding(node.id, embedding);
        }
    }

    /**
     * Search using both text and embedding similarity
     */
    async search(
        query: string,
        embedding: number[],
        filter?: GraphFilter,
        config?: Partial<SearchConfig>
    ): Promise<SearchResult[]> {
        const searchConfig = { ...this.defaultConfig, ...this.config, ...config };
        
        // Perform searches in parallel
        const [textResults, embeddingResults] = await Promise.all([
            this.textSearch.search(query, searchConfig.limit * 2),
            this.embeddingSearch.searchWithScores(embedding, searchConfig.limit * 2)
        ]);

        // Filter results by minimum scores
        const filteredTextResults = textResults
            .filter(r => r.score >= searchConfig.minTextScore)
            .map(r => ({
                ...r,
                score: r.score * searchConfig.textWeight,
                source: 'text' as const
            }));

        const filteredEmbeddingResults = embeddingResults
            .filter(r => r.score >= searchConfig.minEmbeddingScore)
            .map(r => ({
                ...r,
                score: r.score * searchConfig.embeddingWeight,
                source: 'embedding' as const
            }));

        // Merge results
        const mergedResults = this.mergeResults(
            filteredTextResults,
            filteredEmbeddingResults,
            searchConfig.limit
        );

        return mergedResults;
    }

    /**
     * Merge and deduplicate results from both search methods
     */
    private mergeResults(
        textResults: SearchResult[],
        embeddingResults: SearchResult[],
        limit: number
    ): SearchResult[] {
        const resultMap = new Map<string, SearchResult>();

        // Process text results
        textResults.forEach(result => {
            resultMap.set(result.id, result);
        });

        // Process embedding results, combining scores if document exists in both
        embeddingResults.forEach(result => {
            if (resultMap.has(result.id)) {
                const existing = resultMap.get(result.id)!;
                resultMap.set(result.id, {
                    id: result.id,
                    score: (existing.score + result.score) / 2, // Average the scores
                    source: 'hybrid'
                });
            } else {
                resultMap.set(result.id, result);
            }
        });

        // Sort by score and limit results
        return Array.from(resultMap.values())
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }

    /**
     * Extract searchable text content from a node
     */
    private extractTextContent(node: IGraphNode): string {
        const parts: string[] = [];

        // Add node content if it's a string
        if (typeof node.content === 'string') {
            parts.push(node.content);
        } else if (typeof node.content === 'object' && node.content !== null) {
            // For object content, stringify relevant fields
            Object.values(node.content)
                .filter(value => typeof value === 'string')
                .forEach(value => parts.push(value));
        }

        // Add metadata values if they're strings
        node.metadata.forEach((value, key) => {
            if (typeof value === 'string') {
                parts.push(value);
            }
        });

        return parts.join(' ');
    }
}

/**
 * Enhanced hybrid search with temporal awareness and graph-based reranking
 */
export class TemporalHybridSearch extends HybridSearch {
    constructor(
        embeddingSearch: EmbeddingSearch,
        textSearch: BM25Search,
        private reranker: ResultReranker,
        private storage: IGraphStorage,
        config: Partial<SearchConfig> = {}
    ) {
        super(embeddingSearch, textSearch, config);
    }

    /**
     * Enhanced search with temporal awareness and graph-based reranking
     */
    async searchWithTemporal(
        query: string,
        embedding: number[],
        filter?: GraphFilter
    ): Promise<TemporalSearchResult[]> {
        // Get base results from hybrid search
        const baseResults = await super.search(query, embedding);

        // Map base results to temporal results with node data
        const temporalResults = await Promise.all(
            baseResults.map(async (result): Promise<TemporalSearchResult | null> => {
                const node = await this.storage.getNode(result.id);
                if (!node?.createdAt) return null;
                
                return {
                    ...result,
                    timestamp: node.createdAt,
                    validFrom: node.validAt,
                    validUntil: node.expiredAt,
                    confidence: this.calculateConfidence(result.score, node)
                };
            })
        ).then(results => results.filter((r): r is TemporalSearchResult => r !== null));

        // Apply temporal filtering
        const filteredResults = this.applyTemporalFilters(
            temporalResults,
            this.config.temporal
        );

        // Get nodes and apply graph-based reranking
        const nodesWithScores = await Promise.all(
            filteredResults.map(async r => {
                const node = await this.storage.getNode(r.id);
                return node ? { node, score: r.score } : null;
            })
        );

        // Filter out null results and rerank
        const rerankedResults = await this.reranker.rerank(
            query,
            nodesWithScores.filter((item): item is { node: IGraphNode; score: number } => item !== null),
            filter
        );

        // Transform reranked results into TemporalSearchResult objects
        return rerankedResults.map(({ node, score }) => ({
            id: node.id,
            score,
            source: 'hybrid',
            timestamp: node.createdAt,
            confidence: this.calculateConfidence(score, node)
        }));
    }

    /**
     * Apply temporal filters and adjust scores based on time
     */
    private applyTemporalFilters(
        results: TemporalSearchResult[],
        temporal?: SearchConfig['temporal']
    ): TemporalSearchResult[] {
        if (!temporal) return results;

        return results
            .filter(result => {
                if (temporal.asOf) {
                    // Point-in-time filter
                    return (
                        (!result.validFrom || result.validFrom <= temporal.asOf) &&
                        (!result.validUntil || result.validUntil > temporal.asOf)
                    );
                }
                if (temporal.timeWindow) {
                    // Time window filter
                    return (
                        result.timestamp >= temporal.timeWindow.start &&
                        result.timestamp <= temporal.timeWindow.end
                    );
                }
                return true;
            })
            .map(result => ({
                ...result,
                score: this.applyTimeDecay(result, temporal)
            }))
            .sort((a, b) => b.score - a.score);
    }

    /**
     * Apply time decay to score based on temporal distance
     */
    private applyTimeDecay(
        result: TemporalSearchResult,
        temporal: SearchConfig['temporal']
    ): number {
        if (!temporal || !temporal.decayRate) return result.score;

        const referenceTime = temporal.asOf || temporal.timeWindow?.end || new Date();
        const timeDiff = Math.abs(referenceTime.getTime() - result.timestamp.getTime());
        const daysDiff = timeDiff / (1000 * 60 * 60 * 24);
        
        // Apply exponential decay
        return result.score * Math.exp(-temporal.decayRate * daysDiff);
    }

    /**
     * Calculate confidence score based on multiple factors
     */
    private calculateConfidence(score: number, node: IGraphNode): number {
        // Base confidence from search score
        let confidence = score;

        // Adjust based on temporal factors
        if (node.validAt && node.expiredAt) {
            // Higher confidence for items with well-defined validity periods
            confidence *= 1.2;
        }

        // Normalize to 0-1 range
        return Math.min(1, Math.max(0, confidence));
    }
}
