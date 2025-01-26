import { z } from 'zod';
import { 
  GraphTask, 
  LLMConfig,
  GraphFunction,
  RefinedCommunitiesSchema,
  EvaluatePathsSchema,
  UpdateSearchRanksSchema,
  PrepareForEmbeddingSchema,
  TemporalSchema
} from './types';
import { graphPrompts } from './prompts';
import { findTopKPaths, detectCommunitiesLouvain } from '../algorithms';
import { IGraphNode, IGraphEdge } from '../types';

const DEFAULT_CONFIG: LLMConfig = {
  model: 'deepseek-coder-6.7b-instruct',
  temperature: 0.2,
  maxTokens: 1000
};

/**
 * Handles graph operations using a hybrid approach of LLM and algorithms
 */
export class GraphLLMProcessor {
  constructor(
    private llm: any, // OpenAI-compatible client
    private config: LLMConfig = DEFAULT_CONFIG
  ) {}

  /**
   * Process a graph task using LLM function calls
   */
  async process<T>(
    task: GraphTask,
    data: any,
    validator: z.ZodType<T>
  ): Promise<T> {
    const { prompt, functionSchema } = await this.buildPrompt(task, data);
    
    const response = await this.llm.createChatCompletion({
      ...this.config,
      messages: prompt.messages,
      functions: [{
        name: this.getFunctionName(task),
        description: this.getFunctionDescription(task),
        parameters: functionSchema
      }],
      function_call: { name: this.getFunctionName(task) }
    });

    const functionCall = response.choices[0].message.function_call;
    let parsed: any;
    
    try {
      parsed = {
        function: functionCall.name,
        arguments: JSON.parse(functionCall.arguments)
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to parse LLM function call: ${error.message}`);
      }
      throw new Error('Failed to parse LLM function call: Unknown error');
    }

    try {
      return validator.parse(parsed);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`Invalid function call format: ${error.errors.map(e => e.message).join(', ')}`);
      }
      throw new Error('Invalid function call format: Unknown error');
    }
  }

  /**
   * Build prompt and get schema for specific task
   */
  private async buildPrompt(task: GraphTask, data: any): Promise<{ prompt: any, functionSchema: any }> {
    switch (task) {
      case GraphTask.REFINE_COMMUNITIES: {
        // First detect communities using algorithm
        const communities = detectCommunitiesLouvain(data.nodes, data.edges);
        return {
          prompt: graphPrompts.refineCommunities(communities, data.nodes, data.edges),
          functionSchema: RefinedCommunitiesSchema
        };
      }
      
      case GraphTask.EVALUATE_PATHS: {
        // First find paths using algorithm
        const paths = findTopKPaths(
          data.start,
          data.end,
          data.nodes,
          data.edges,
          3
        );
        return {
          prompt: graphPrompts.evaluatePaths(paths, data.start, data.end),
          functionSchema: EvaluatePathsSchema
        };
      }
      
      case GraphTask.RERANK_RESULTS:
        return {
          prompt: graphPrompts.rerank(data.query, data.results),
          functionSchema: UpdateSearchRanksSchema
        };
      
      case GraphTask.PREPARE_FOR_EMBEDDING:
        return {
          prompt: graphPrompts.prepareForEmbedding(data.text),
          functionSchema: PrepareForEmbeddingSchema
        };
      
      case GraphTask.EXTRACT_TEMPORAL:
        return {
          prompt: graphPrompts.extractTemporal(data.text, data.referenceTime),
          functionSchema: TemporalSchema
        };
      
      default:
        throw new Error(`Unknown task: ${task}`);
    }
  }

  /**
   * Get function name for task
   */
  private getFunctionName(task: GraphTask): string {
    switch (task) {
      case GraphTask.REFINE_COMMUNITIES:
        return GraphFunction.REFINE_COMMUNITIES;
      case GraphTask.EVALUATE_PATHS:
        return GraphFunction.EVALUATE_PATHS;
      case GraphTask.RERANK_RESULTS:
        return GraphFunction.UPDATE_SEARCH_RANKS;
      case GraphTask.EXTRACT_TEMPORAL:
        return GraphFunction.ADD_TEMPORAL_EDGES;
      default:
        throw new Error(`Unknown task: ${task}`);
    }
  }

  /**
   * Get function description for task
   */
  private getFunctionDescription(task: GraphTask): string {
    switch (task) {
      case GraphTask.REFINE_COMMUNITIES:
        return 'Analyze and refine algorithmically detected communities with semantic understanding';
      case GraphTask.EVALUATE_PATHS:
        return 'Evaluate and explain paths between nodes found by pathfinding algorithm';
      case GraphTask.RERANK_RESULTS:
        return 'Rerank search results based on semantic relevance to query';
      case GraphTask.PREPARE_FOR_EMBEDDING:
        return 'Prepare text for embedding by identifying key concepts and context';
      case GraphTask.EXTRACT_TEMPORAL:
        return 'Extract temporal relationships between events';
      default:
        throw new Error(`Unknown task: ${task}`);
    }
  }
}
