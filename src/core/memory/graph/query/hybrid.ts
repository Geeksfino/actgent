import { IGraphNode, GraphFilter, IGraphStorage } from '../data/types';
import { EmbeddingSearch } from './embedding';
import { BM25Search } from './bm25';
import { ResultReranker } from './reranking';

interface SearchResult {
    id: string;
    score: number;
    source: 'embedding' | 'text' | 'hybrid';
    node: IGraphNode;
}

export interface TemporalSearchResult extends SearchResult {
    timestamp: Date;
    validFrom?: Date;
    validUntil?: Date;
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
    protected defaultConfig: SearchConfig = {
        textWeight: 0.4,
        embeddingWeight: 0.6,
        minTextScore: 0.1,
        minEmbeddingScore: 0.5,
        limit: 10
    };

    constructor(
        protected embeddingSearch: EmbeddingSearch,
        protected textSearch: BM25Search,
        protected reranker: ResultReranker,
        protected config: Partial<SearchConfig> = {},
        protected storage: IGraphStorage
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
     * Helper method to safely get node
     */
    protected async getNodeOrThrow(id: string): Promise<IGraphNode> {
        const node = await this.storage.getNode(id);
        if (!node) {
            throw new Error(`Node not found: ${id}`);
        }
        return node;
    }

    protected isSearchResult(result: unknown): result is SearchResult {
        if (!result || typeof result !== 'object') return false;
        const r = result as any;
        return (
            typeof r.id === 'string' &&
            typeof r.score === 'number' &&
            (r.source === 'text' || r.source === 'embedding' || r.source === 'hybrid') &&
            r.node !== undefined
        );
    }

    protected isTemporalSearchResult(result: unknown): result is TemporalSearchResult {
        if (!this.isSearchResult(result)) return false;
        const r = result as any;
        return (
            r.timestamp instanceof Date &&
            typeof r.confidence === 'number' &&
            (r.validFrom === undefined || r.validFrom instanceof Date) &&
            (r.validUntil === undefined || r.validUntil instanceof Date)
        );
    }

    /**
     * Fix text search results handling
     */
    protected async processTextResults(results: any[]): Promise<SearchResult[]> {
        type TextResult = {
            id: string;
            score: number;
            source: 'text';
            node: IGraphNode;
        };

        const validResults = await Promise.all(
            results.map(async (result): Promise<TextResult | null> => {
                try {
                    const node = await this.getNodeOrThrow(result.id);
                    return {
                        id: result.id,
                        score: result.score,
                        source: 'text',
                        node
                    };
                } catch {
                    return null;
                }
            })
        );
        return validResults.filter((result): result is TextResult => result !== null);
    }

    /**
     * Fix embedding search results handling
     */
    protected async processEmbeddingResults(results: any[]): Promise<SearchResult[]> {
        type EmbeddingResult = {
            id: string;
            score: number;
            source: 'embedding';
            node: IGraphNode;
        };

        const validResults = await Promise.all(
            results.map(async (result): Promise<EmbeddingResult | null> => {
                try {
                    const node = await this.getNodeOrThrow(result.id);
                    return {
                        id: result.id,
                        score: result.score,
                        source: 'embedding',
                        node
                    };
                } catch {
                    return null;
                }
            })
        );
        return validResults.filter((result): result is EmbeddingResult => result !== null);
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

        const textSearchResults = await this.processTextResults(textResults);
        const embeddingSearchResults = await this.processEmbeddingResults(embeddingResults);

        // Combine all results with their sources
        const allResults = [
            ...textSearchResults.map(r => ({ ...r, source: 'text' as const })),
            ...embeddingSearchResults.map(r => ({ ...r, source: 'embedding' as const }))
        ];

        // Use reranker to combine and rerank results
        const rerankedResults = await this.reranker.rerank(query, allResults, filter);
        
        // Convert back to SearchResult format
        return rerankedResults.map(({ node, score }) => ({
            id: node.id,
            score,
            source: 'hybrid',
            node
        }));
    }

    /**
     * Search with temporal awareness
     */
    async searchWithTemporal(
        query: string,
        embedding: number[],
        filter?: GraphFilter
    ): Promise<TemporalSearchResult[]> {
        const baseResults = await this.search(query, embedding, filter);
        
        // Convert to temporal results with proper type handling
        const temporalResults: TemporalSearchResult[] = baseResults.map(result => {
            const temporal: TemporalSearchResult = {
                ...result,
                timestamp: new Date(),
                confidence: result.score,
                validFrom: undefined,
                validUntil: undefined
            };
            return temporal;
        });

        // Apply temporal filtering if needed
        if (filter?.temporal) {
            return this.applyTemporalFilters(temporalResults, filter.temporal);
        }

        return temporalResults;
    }

    /**
     * Apply temporal filters and adjust scores based on time
     */
    protected applyTemporalFilters(
        results: TemporalSearchResult[],
        temporal: NonNullable<SearchConfig['temporal']>
    ): TemporalSearchResult[] {
        // Implementation of temporal filtering...
        return results;
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

    /**
     * Calculate confidence score based on multiple factors
     */
    protected calculateConfidence(score: number, node: IGraphNode): number {
        let confidence = score;

        // Adjust confidence based on metadata
        const role = node.metadata.get('role');
        if (role === 'assistant') {
            confidence *= 1.2; // Boost assistant responses
        }

        // Cap confidence at 1.0
        return Math.min(confidence, 1.0);
    }
}

/**
 * Enhanced hybrid search with temporal awareness and graph-based reranking
 */
export class TemporalHybridSearch extends HybridSearch {
    constructor(
        embeddingSearch: EmbeddingSearch,
        textSearch: BM25Search,
        protected reranker: ResultReranker,
        storage: IGraphStorage,
        config: Partial<SearchConfig> = {}
    ) {
        super(embeddingSearch, textSearch, reranker, config, storage);
    }

    async searchWithTemporal(
        query: string,
        embedding: number[],
        filter?: GraphFilter
    ): Promise<TemporalSearchResult[]> {
        const baseResults = await this.search(query, embedding, filter);
        
        // Convert to temporal results with proper type handling
        const temporalResults: TemporalSearchResult[] = baseResults.map(result => ({
            ...result,
            timestamp: new Date(),
            confidence: result.score,
            validFrom: undefined,
            validUntil: undefined
        }));

        // Apply temporal filtering if needed
        const filteredResults = filter?.temporal ? 
            this.applyTemporalFilters(temporalResults, filter.temporal) : 
            temporalResults;

        // Get nodes and apply graph-based reranking
        const nodesWithScores = await Promise.all(
            filteredResults.map(async result => {
                try {
                    const node = await this.getNodeOrThrow(result.id);
                    // Map 'hybrid' source to 'text' for reranking
                    const source = result.source === 'hybrid' ? 'text' : result.source;
                    return {
                        node,
                        score: result.score,
                        source
                    };
                } catch {
                    return null;
                }
            })
        );

        // Filter out null results and rerank
        const validNodesWithScores = nodesWithScores
            .filter((item): item is { node: IGraphNode; score: number; source: 'embedding' | 'text' } => 
                item !== null && (item.source === 'embedding' || item.source === 'text')
            );

        // Apply reranking if we have valid results
        if (validNodesWithScores.length === 0) {
            return [];
        }

        // Rerank using the reranker
        const rerankedResults = await this.reranker.rerank(query, validNodesWithScores, filter);

        // Convert back to temporal results
        return rerankedResults.map(({ node, score }) => ({
            id: node.id,
            score,
            source: 'hybrid' as const,
            node,
            timestamp: new Date(),
            confidence: score,
            validFrom: undefined,
            validUntil: undefined
        }));
    }

    protected applyTemporalFilters(
        results: TemporalSearchResult[],
        temporal: NonNullable<SearchConfig['temporal']>
    ): TemporalSearchResult[] {
        // Implementation of temporal filtering...
        return results;
    }
}
