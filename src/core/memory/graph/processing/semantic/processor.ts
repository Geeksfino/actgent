import { GraphLLMProcessor } from '../episodic/processor';
import { GraphTask } from '../../types';

/**
 * Entity resolution processor that uses LLM to identify and resolve duplicates
 */
export class EntityResolutionProcessor {
    constructor(private llm: GraphLLMProcessor) {}

    private buildResolutionPrompt(newNode: any, existingNodes: any[]): string {
        return `Given the list of EXISTING NODES, determine if the NEW NODE is a duplicate entity.

EXISTING NODES:
${JSON.stringify(existingNodes, null, 2)}

NEW NODE:
${JSON.stringify(newNode, null, 2)}

Task:
1. If the New Node represents the same entity as any node in Existing Nodes, return 'is_duplicate: true'. Otherwise, return 'is_duplicate: false'
2. If is_duplicate is true, also return the uuid of the existing node
3. If is_duplicate is true, return the most complete full name for the node

Guidelines:
1. Use both the name and summary of nodes to determine if entities are duplicates
2. Duplicate nodes may have different names but refer to the same entity
3. Consider all available context when making the determination
4. Be conservative - only mark as duplicate if highly confident

Required Output Format:
JSON object containing:
- is_duplicate: boolean
- existing_node_id: string (if is_duplicate is true)
- resolved_name: string (if is_duplicate is true)`;
    }

    /**
     * Resolve a single node against existing nodes
     */
    async resolveNode(input: any): Promise<any> {
        const prompt = this.buildResolutionPrompt(input.newNode, input.existingNodes);

        return await this.llm.process(GraphTask.DEDUPE_NODE, {
            prompt,
        });
    }

    /**
     * Resolve multiple nodes in batch
     */
    async resolveNodes(input: any): Promise<any> {
        const prompt = this.buildResolutionPrompt(input.nodes[0], input.nodes.slice(1));

        return await this.llm.process(GraphTask.DEDUPE_BATCH, {
            prompt,
        });
    }

    /**
     * Resolve a single edge against existing edges
     */
    async resolveEdge(input: any): Promise<any> {
        const prompt = `Given the following edges, determine if the NEW EDGE represents the same relationship as any of the EXISTING EDGES.

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

        return await this.llm.process(GraphTask.DEDUPE_EDGE, {
            prompt,
        });
    }

    /**
     * Resolve multiple edges in batch
     */
    async resolveEdges(input: any): Promise<any> {
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

        return await this.llm.process(GraphTask.DEDUPE_BATCH_EDGES, {
            prompt,
        });
    }
}
