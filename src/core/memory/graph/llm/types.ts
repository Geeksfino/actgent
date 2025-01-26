import { z } from 'zod';
import { IGraphNode, IGraphEdge } from '../types';

/**
 * Available graph operation functions
 */
export enum GraphFunction {
  UPDATE_SEARCH_RANKS = 'update_search_ranks',
  REFINE_COMMUNITIES = 'refine_communities',
  EVALUATE_PATHS = 'evaluate_paths',
  ADD_TEMPORAL_EDGES = 'add_temporal_edges',
  PREPARE_FOR_EMBEDDING = 'prepare_for_embedding'
}

/**
 * Available LLM tasks for graph operations
 */
export enum GraphTask {
  RERANK_RESULTS = 'rerank_results',
  REFINE_COMMUNITIES = 'refine_communities',
  EVALUATE_PATHS = 'evaluate_paths',
  PREPARE_FOR_EMBEDDING = 'prepare_for_embedding',
  EXTRACT_TEMPORAL = 'extract_temporal'
}

/**
 * Configuration for LLM requests
 */
export interface LLMConfig {
  model: string;
  temperature: number;
  maxTokens: number;
}

/**
 * Schema for embedding vectors
 */
export const EmbeddingSchema = z.array(z.number())
  .length(384)
  .refine(arr => arr.every(n => n >= -1 && n <= 1));

/**
 * Schema for search results
 */
export const SearchResultSchema = z.array(z.object({
  id: z.string(),
  score: z.number(),
  content: z.string(),
  metadata: z.record(z.string(), z.any())
}));

/**
 * Schema for embedding preparation
 */
export const PrepareForEmbeddingSchema = z.object({
  function: z.literal(GraphFunction.PREPARE_FOR_EMBEDDING),
  arguments: z.object({
    text: z.string(),
    key_concepts: z.array(z.string()),
    suggested_context: z.string()
  })
});

/**
 * Schema for search results
 */
export const UpdateSearchRanksSchema = z.object({
  function: z.literal(GraphFunction.UPDATE_SEARCH_RANKS),
  arguments: z.object({
    ranked_results: z.array(z.object({
      id: z.string(),
      score: z.number().min(0).max(1),
      relevance_explanation: z.string()
    })),
    search_context: z.object({
      query_intent: z.string(),
      key_concepts: z.array(z.string())
    })
  })
});

/**
 * Schema for community refinement
 */
export const RefinedCommunitiesSchema = z.object({
  function: z.literal(GraphFunction.REFINE_COMMUNITIES),
  arguments: z.object({
    communities: z.array(z.object({
      id: z.string(),
      name: z.string(),
      nodes: z.array(z.string()),
      description: z.string(),
      confidence: z.number().min(0).max(1)
    })),
    relationships: z.array(z.object({
      source: z.string(),
      target: z.string(),
      type: z.string(),
      description: z.string()
    })).optional()
  })
});

/**
 * Schema for path evaluation
 */
export const EvaluatePathsSchema = z.object({
  function: z.literal(GraphFunction.EVALUATE_PATHS),
  arguments: z.object({
    paths: z.array(z.object({
      path_id: z.string(),
      nodes: z.array(z.string()),
      relevance_score: z.number().min(0).max(1),
      explanation: z.string(),
      key_relationships: z.array(z.object({
        from: z.string(),
        to: z.string(),
        significance: z.string()
      }))
    }))
  })
});

/**
 * Schema for temporal extraction
 */
export const ExtractTemporalSchema = z.object({
  function: z.literal(GraphFunction.ADD_TEMPORAL_EDGES),
  arguments: z.object({
    edges: z.array(z.object({
      source: z.string(),
      target: z.string(),
      type: z.string(),
      start_time: z.string().datetime().optional(),
      end_time: z.string().datetime().optional(),
      confidence: z.number().min(0).max(1)
    }))
  })
});

/**
 * Schema for temporal extraction
 */
export const TemporalSchema = z.object({
  validAt: z.date().optional(),
  invalidAt: z.date().optional(),
  confidence: z.number().min(0).max(1)
});

/**
 * Schema for temporal validation
 */
export const TemporalValidationSchema = z.object({
  isValid: z.boolean(),
  confidence: z.number().min(0).max(1),
  reason: z.string().optional()
});

/**
 * Schema for path finding results
 */
export const PathSchema = z.object({
  nodes: z.array(z.string()),
  edges: z.array(z.string()),
  cost: z.number(),
  explanation: z.string()
});

/**
 * Schema for community detection
 */
export const CommunitySchema = z.object({
  communities: z.array(z.object({
    id: z.string(),
    nodes: z.array(z.string()),
    summary: z.string(),
    confidence: z.number().min(0).max(1)
  }))
});

export const CommunityResult = z.object({
  communities: z.array(z.array(z.string())),
  explanation: z.string()
});

export type Embedding = z.infer<typeof EmbeddingSchema>;
export type SearchResult = z.infer<typeof SearchResultSchema>;
export type PrepareForEmbedding = z.infer<typeof PrepareForEmbeddingSchema>;
export type UpdateSearchRanks = z.infer<typeof UpdateSearchRanksSchema>;
export type RefinedCommunities = z.infer<typeof RefinedCommunitiesSchema>;
export type EvaluatePaths = z.infer<typeof EvaluatePathsSchema>;
export type TemporalResult = z.infer<typeof TemporalSchema>;
export type TemporalValidationResult = z.infer<typeof TemporalValidationSchema>;
export type PathResult = z.infer<typeof PathSchema>;
export type CommunityResult = z.infer<typeof CommunityResult>;
