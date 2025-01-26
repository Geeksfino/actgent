import { GraphLLMProcessor } from '../llm/processor';
import { GraphTask } from '../llm/types';
import { PrepareForEmbeddingSchema } from '../llm/types';

export interface IEmbedder {
  encode(text: string): Promise<number[]>;
}

/**
 * Service for generating and managing embeddings
 */
export class EmbeddingService {
  constructor(
    private embedder: IEmbedder,
    private llm: GraphLLMProcessor
  ) {}

  /**
   * Generate embedding with LLM-enhanced text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    // First use LLM to enhance text with key concepts
    const enhanced = await this.llm.process(
      GraphTask.PREPARE_FOR_EMBEDDING,
      { text },
      PrepareForEmbeddingSchema
    );

    // Generate embedding using the enhanced text
    const enhancedText = [
      enhanced.arguments.text,
      ...enhanced.arguments.key_concepts,
      enhanced.arguments.suggested_context
    ].join(' ');

    return this.embedder.encode(enhancedText);
  }

  /**
   * Batch generate embeddings
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(text => this.generateEmbedding(text)));
  }
}
