import { DEFAULT_RERANKER_CONFIG } from '../config/defaults';
import { z } from 'zod';
import { RerankerConfig } from '../config/types';

export interface LLMRerankerInterface {
    rerank(query: string, results: SearchResult[]): Promise<RerankResult[]>;
}

export interface LLMRerankerConfig {
    apiKey?: string;
}

export interface RerankResult {
    name: string;
    type: string;
    summary: string;
}

export interface SearchResult {
    name: string;
    type: string;
    summary: string;
}

export class LLMReranker implements LLMRerankerInterface {
    constructor(
        private llm: any,
        private config: RerankerConfig = DEFAULT_RERANKER_CONFIG
    ) { }

    async rerank(query: string, nodes: SearchResult[]): Promise<RerankResult[]> {
        console.log("RERANK_RESULTS data: ", { query, nodes });
        const rerankResultsPrompt = `Rerank search results for query "${query}":\n${JSON.stringify(nodes)}`;
        console.log("RERANK_RESULTS prompt: ", rerankResultsPrompt);
        const req = this.prepareRerankRequest({ query, nodes });
        return req as any as RerankResult[];
    }

    prepareRerankRequest(data: { query: string; nodes: SearchResult[] }): { prompt: string; functionSchema: z.ZodObject<{ name: z.ZodString; type: z.ZodString; summary: z.ZodString }> } {
        console.log("RERANK_RESULTS data: ", data);
        const rerankResultsPrompt = `Rerank search results for query \"${data.query}\":\n${JSON.stringify(data.nodes)}`;
        console.log("RERANK_RESULTS prompt: ", rerankResultsPrompt);
        return {
            prompt: rerankResultsPrompt,
            functionSchema: z.object({ name: z.string(), type: z.string(), summary: z.string() })
        };
    }
}
