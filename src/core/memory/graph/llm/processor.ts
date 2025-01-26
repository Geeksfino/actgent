import { z } from 'zod';
import { GraphTask, LLMConfig } from './types';
import { graphPrompts } from './prompts';

const DEFAULT_CONFIG: LLMConfig = {
  model: 'deepseek-coder-6.7b-instruct',
  temperature: 0.2,
  maxTokens: 1000
};

/**
 * Handles all LLM-based graph operations
 */
export class GraphLLMProcessor {
  constructor(
    private llm: any, // OpenAI-compatible client
    private config: LLMConfig = DEFAULT_CONFIG
  ) {}

  /**
   * Process a graph task using LLM
   */
  async process<T>(
    task: GraphTask,
    data: any,
    validator: z.ZodType<T>
  ): Promise<T> {
    const prompt = this.buildPrompt(task, data);
    const response = await this.llm.createChatCompletion({
      ...this.config,
      messages: prompt.messages
    });

    const content = response.choices[0].message.content;
    let parsed: any;
    
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to parse LLM response: ${error.message}`);
      }
      throw new Error('Failed to parse LLM response: Unknown error');
    }

    try {
      return validator.parse(parsed);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`Invalid LLM response format: ${error.errors.map(e => e.message).join(', ')}`);
      }
      throw new Error('Invalid LLM response format: Unknown error');
    }
  }

  /**
   * Build prompt for specific task
   */
  private buildPrompt(task: GraphTask, data: any) {
    switch (task) {
      case GraphTask.GENERATE_EMBEDDING:
        return graphPrompts.generateEmbedding(data.text);
      
      case GraphTask.RERANK_RESULTS:
        return graphPrompts.rerank(data.query, data.results);
      
      case GraphTask.FIND_PATH:
        return graphPrompts.findPath(
          data.start,
          data.end,
          data.nodes,
          data.edges
        );
      
      case GraphTask.DETECT_COMMUNITIES:
        return graphPrompts.detectCommunities(data.nodes, data.edges);
      
      case GraphTask.EXTRACT_TEMPORAL:
        return graphPrompts.extractTemporal(data.text, data.referenceTime);
      
      default:
        throw new Error(`Unknown task: ${task}`);
    }
  }

  /**
   * Cache management (optional)
   */
  async clearCache(): Promise<void> {
    // Implement if needed
  }
}
