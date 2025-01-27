import { z } from 'zod';
import { 
    PathSchema,
    CommunitySchema,
    SearchResultSchema,
    TemporalSchema,
    EpisodeConsolidationSchema
} from './types';
import { GraphTask, LLMConfig } from '../../types';

const DEFAULT_CONFIG: LLMConfig = {
    model: 'deepseek-coder-6.7b-instruct',
    temperature: 0.2,
    maxTokens: 1000
};

/**
 * LLM processor for graph operations
 */
export class GraphLLMProcessor {
    constructor(
        private llm: any, // OpenAI-compatible client
        private config: LLMConfig = DEFAULT_CONFIG
    ) {}

    /**
     * Process a graph task using LLM
     */
    async process<T>(task: GraphTask, data: any): Promise<T> {
        const { prompt, functionSchema } = this.prepareRequest(task, data);
        
        const response = await this.llm.createChatCompletion({
            ...this.config,
            messages: [{ role: 'user', content: prompt }],
            functions: [{
                name: this.getFunctionName(task),
                parameters: functionSchema
            }],
            function_call: { name: this.getFunctionName(task) }
        });

        const result = JSON.parse(response.choices[0].message.function_call.arguments);
        return result;
    }

    private prepareRequest(task: GraphTask, data: any): { prompt: string; functionSchema: z.ZodType<any> } {
        switch (task) {
            case GraphTask.REFINE_COMMUNITIES:
                return {
                    prompt: `Analyze and refine the following graph communities:\n${JSON.stringify(data)}`,
                    functionSchema: CommunitySchema
                };
            
            case GraphTask.EVALUATE_PATHS:
                return {
                    prompt: `Evaluate paths between nodes:\n${JSON.stringify(data)}`,
                    functionSchema: PathSchema
                };
            
            case GraphTask.RERANK_RESULTS:
                return {
                    prompt: `Rerank search results for query "${data.query}":\n${JSON.stringify(data.nodes)}`,
                    functionSchema: SearchResultSchema
                };
            
            case GraphTask.PREPARE_FOR_EMBEDDING:
                return {
                    prompt: `Prepare text for embedding:\n${JSON.stringify(data)}`,
                    functionSchema: z.array(z.number())
                };

            case GraphTask.CONSOLIDATE_EPISODES:
                return {
                    prompt: `Analyze these episodes and identify patterns to consolidate them into higher-level memories:\n${JSON.stringify(data)}`,
                    functionSchema: EpisodeConsolidationSchema
                };

            case GraphTask.EXTRACT_TEMPORAL:
                return {
                    prompt: `Extract temporal relationships from:\n${JSON.stringify(data)}`,
                    functionSchema: TemporalSchema
                };
            
            default:
                throw new Error(`Unknown task: ${task}`);
        }
    }

    private getFunctionName(task: GraphTask): string {
        switch (task) {
            case GraphTask.REFINE_COMMUNITIES:
                return 'refine_communities';
            case GraphTask.EVALUATE_PATHS:
                return 'evaluate_paths';
            case GraphTask.RERANK_RESULTS:
                return 'update_search_ranks';
            case GraphTask.EXTRACT_TEMPORAL:
                return 'extract_temporal';
            case GraphTask.PREPARE_FOR_EMBEDDING:
                return 'prepare_for_embedding';
            case GraphTask.CONSOLIDATE_EPISODES:
                return 'consolidate_episodes';
            default:
                throw new Error(`Unknown task: ${task}`);
        }
    }
}
