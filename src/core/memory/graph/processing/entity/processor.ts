import { GraphLLMProcessor } from '../llm/processor';
import { GraphTask } from '../../types';
import {
    EntityResolution,
    EntityResolutionInput,
    BatchEntityResolution,
    BatchEntityResolutionInput,
    EdgeResolution,
    EdgeResolutionInput,
    BatchEdgeResolution,
    BatchEdgeResolutionInput,
    EntityResolutionSchema,
    BatchEntityResolutionSchema,
    EdgeResolutionSchema,
    BatchEdgeResolutionSchema
} from './types';

/**
 * Entity resolution processor that uses LLM to identify and resolve duplicates
 */
export class EntityResolutionProcessor {
    constructor(private llm: GraphLLMProcessor) {}

    /**
     * Resolve a single node against existing nodes
     */
    async resolveNode(input: EntityResolutionInput): Promise<EntityResolution> {
        const prompt = `Given the following context, determine if the NEW NODE represents the same entity as any of the EXISTING NODES.

<EXISTING NODES>
${JSON.stringify(input.existingNodes, null, 2)}
</EXISTING NODES>

<NEW NODE>
${JSON.stringify(input.newNode, null, 2)}
</NEW NODE>

${input.context ? `
<CONTEXT>
Previous Episodes:
${JSON.stringify(input.context.previousEpisodes || [], null, 2)}

Current Episode:
${input.context.episodeContent || ''}
</CONTEXT>
` : ''}

Task:
1. If the New Node represents the same entity as any node in Existing Nodes, return 'isDuplicate: true'.
2. If isDuplicate is true, also return:
   - The ID of the existing node
   - An updated name that combines the best information from both nodes
3. Provide a confidence score (0-1) indicating how certain you are about the match
4. Explain your reasoning

Guidelines:
1. Use both content and metadata to determine if entities are duplicates
2. Duplicates may have different names but refer to the same entity
3. Consider context from episodes if provided
4. Be conservative - only mark as duplicate if highly confident`;

        return await this.llm.process<EntityResolution>(GraphTask.DEDUPE_NODE, {
            prompt,
            schema: EntityResolutionSchema
        });
    }

    /**
     * Resolve multiple nodes in batch
     */
    async resolveNodes(input: BatchEntityResolutionInput): Promise<BatchEntityResolution> {
        const prompt = `Given the following list of nodes, identify all duplicate entities and group them together.

<NODES>
${JSON.stringify(input.nodes, null, 2)}
</NODES>

${input.context ? `
<CONTEXT>
Previous Episodes:
${JSON.stringify(input.context.previousEpisodes || [], null, 2)}

Current Episode:
${input.context.episodeContent || ''}
</CONTEXT>
` : ''}

Task:
1. For each node, determine if it is a duplicate of any other node
2. Group duplicate nodes together, selecting:
   - A primary node ID for each group
   - List of duplicate node IDs
   - Best combined name for the group
3. Provide confidence scores for each match
4. Explain your reasoning for each match

Guidelines:
1. Use both content and metadata to determine duplicates
2. Consider context from episodes if provided
3. Only group nodes if highly confident they represent the same entity
4. Prefer more recent nodes as primary IDs`;

        return await this.llm.process<BatchEntityResolution>(GraphTask.DEDUPE_BATCH, {
            prompt,
            schema: BatchEntityResolutionSchema
        });
    }

    /**
     * Resolve a single edge against existing edges
     */
    async resolveEdge(input: EdgeResolutionInput): Promise<EdgeResolution> {
        const prompt = `Given the following context, determine if the NEW EDGE represents the same relationship as any of the EXISTING EDGES.

<EXISTING EDGES>
${JSON.stringify(input.existingEdges, null, 2)}
</EXISTING EDGES>

<NEW EDGE>
${JSON.stringify(input.newEdge, null, 2)}
</NEW EDGE>

${input.context ? `
<CONTEXT>
Previous Episodes:
${JSON.stringify(input.context.previousEpisodes || [], null, 2)}

Current Episode:
${input.context.episodeContent || ''}
</CONTEXT>
` : ''}

Task:
1. If the New Edge represents the same relationship as any edge in Existing Edges, return 'isDuplicate: true'
2. If isDuplicate is true, return the ID of the existing edge
3. Provide a confidence score (0-1) indicating certainty
4. Explain your reasoning

Guidelines:
1. Compare both the relationship type and the connected nodes
2. Consider temporal validity of relationships
3. Consider context from episodes if provided
4. Be conservative - only mark as duplicate if highly confident`;

        return await this.llm.process<EdgeResolution>(GraphTask.DEDUPE_EDGE, {
            prompt,
            schema: EdgeResolutionSchema
        });
    }

    /**
     * Resolve multiple edges in batch
     */
    async resolveEdges(input: BatchEdgeResolutionInput): Promise<BatchEdgeResolution> {
        const prompt = `Given the following list of edges, identify all duplicate relationships and group them together.

<EDGES>
${JSON.stringify(input.edges, null, 2)}
</EDGES>

${input.context ? `
<CONTEXT>
Previous Episodes:
${JSON.stringify(input.context.previousEpisodes || [], null, 2)}

Current Episode:
${input.context.episodeContent || ''}
</CONTEXT>
` : ''}

Task:
1. For each edge, determine if it is a duplicate of any other edge
2. Group duplicate edges together, selecting:
   - A primary edge ID for each group
   - List of duplicate edge IDs
3. Provide confidence scores for each match
4. Explain your reasoning for each match

Guidelines:
1. Compare both relationship types and connected nodes
2. Consider temporal validity of relationships
3. Consider context from episodes if provided
4. Only group edges if highly confident they represent the same relationship
5. Prefer more recent edges as primary IDs`;

        return await this.llm.process<BatchEdgeResolution>(GraphTask.DEDUPE_BATCH_EDGES, {
            prompt,
            schema: BatchEdgeResolutionSchema
        });
    }
}
