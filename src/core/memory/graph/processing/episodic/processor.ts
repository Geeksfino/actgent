import { z } from 'zod';
import { GraphTask, LLMConfig } from '../../types';
import { IGraphNode, IGraphEdge, EpisodeContent } from '../../data/types';
import OpenAI from 'openai';
import { retry } from "/Users/cliang/repos/clipforge/actgent/src/core/utils/retry";

interface Message {
    id: string;
    body: string;
    role: string;
    timestamp: Date;
    sessionId: string;
    context?: any;
}

/**
 * LLM processor for graph operations
 */
export class EpisodicGraphProcessor {
    private llm: OpenAI;
    private config: LLMConfig;

    constructor(config: LLMConfig & { client: OpenAI }) {
        this.llm = config.client;
        this.config = config;
    }

    /**
     * Process a graph task using LLM
     */
    async process<T>(task: GraphTask, data: any): Promise<T> {
        const request = this.prepareRequest(task, data);

        // Use retry logic with exponential backoff
        const llmCall = async () => {
            const baseConfig: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
                model: this.config.model,
                messages: [
                    { role: 'system', content: 'You are a helpful assistant that processes graph operations. Always use the provided function to return your response.' },
                    { role: 'user', content: request.prompt }
                ],
                tools: [{
                    type: 'function',
                    function: {
                        name: this.getFunctionName(task),
                        parameters: this.convertZodToJsonSchema(request.functionSchema)
                    }
                }],
                tool_choice: { type: 'function', function: { name: this.getFunctionName(task) } },
                stream: false
            };

            const response = await this.llm.chat.completions.create(baseConfig);
            const message = response.choices[0].message;
            const finishReason = response.choices[0].finish_reason;
            const isToolCalls = finishReason === 'tool_calls';

            if (!isToolCalls || !message.tool_calls) {
                throw new Error('No tool calls in response');
            }

            const toolCall = message.tool_calls[0];
            // Pretty print the raw LLM response
            console.log('\nRaw LLM Response:');
            console.log(JSON.stringify(JSON.parse(toolCall.function.arguments), null, 2));

            return JSON.parse(toolCall.function.arguments);
        };

        try {
            const rawResponse = await retry(llmCall, 3, 1000);

            // Define a simple schema for entities
            const EntitySchema = z.object({
                id: z.number(),
                name: z.string(),
                type: z.string(),
                summary: z.string().optional()
            });

            // Validate only the entities part
            if (task === GraphTask.EXTRACT_TEMPORAL) {
                const entities = rawResponse.entities;
                try {
                    EntitySchema.array().parse(entities);
                } catch (error) {
                    if (error instanceof z.ZodError) {
                        console.error("Entity validation failed:", error.errors);
                        // Handle the validation error
                    } else {
                        console.error("Unexpected error during validation:", error);
                        // Handle other unexpected errors
                    }
                }
            }

            return rawResponse as T;
        } catch (error) {
            console.error("LLM call failed after multiple retries:", error);
            throw error;
        }
    }

    private prepareRequest(task: GraphTask, data: any): { prompt: string; functionSchema: z.ZodType<any> } {
        switch (task) {
            case GraphTask.DEDUPE_NODES:
                console.log("DEDUPE_NODES data: ", data);
                const dedupeNodesPrompt = this.buildDedupeNodesPrompt({ entities: data.entities, context: data.context });
                console.log("DEDUPE_NODES prompt: ", dedupeNodesPrompt);
                return {
                    prompt: dedupeNodesPrompt,
                    functionSchema: z.object({
                        results: z.array(z.object({
                            isDuplicate: z.boolean(),
                            duplicateOf: z.string().nullable(),
                        }))
                    })
                };

            case GraphTask.EXTRACT_ENTITIES:
                console.log("EXTRACT_ENTITIES data: ", data);
                const extractEntitiesPrompt = this.buildEntityExtractionPrompt({ text: data.text, context: data.context });
                console.log("EXTRACT_ENTITIES prompt: ", extractEntitiesPrompt);
                return {
                    prompt: extractEntitiesPrompt,
                    functionSchema: z.object({
                        entities: z.array(z.object({
                            id: z.number(),
                            name: z.string(),
                            type: z.string(),
                            summary: z.string().optional()
                        }))
                    })
                };

            case GraphTask.EXTRACT_TEMPORAL:
                // console.log("EXTRACT_TEMPORAL data: ", data);
                const extractTemporalPrompt = this.buildTemporalExtractionPrompt({ text: data.text, context: data.context, referenceTimestamp: data.metadata?.timestamp?.toISOString(), fact: data.fact });
                // console.log("EXTRACT_TEMPORAL prompt: ", extractTemporalPrompt);
                return {
                    prompt: extractTemporalPrompt,
                    functionSchema: z.object({
                        entities: z.array(z.object({
                            id: z.number(),
                            name: z.string(),
                            type: z.string(),
                            summary: z.string().optional()
                        })),
                        relationships: z.array(z.object({
                            sourceId: z.number(),
                            targetId: z.number(),
                            type: z.string(),
                            name: z.string().optional(),
                            description: z.string().optional(),
                            valid_at: z.string().nullable(),
                            invalid_at: z.string().nullable()
                        }))
                    })
                };

            case GraphTask.REFINE_COMMUNITIES:
                // console.log("REFINE_COMMUNITIES data: ", data);
                const refineCommunityPrompt = this.buildRefineCommunityPrompt(data);
                // console.log("REFINE_COMMUNITIES prompt: ", refineCommunityPrompt);
                return {
                    prompt: refineCommunityPrompt,
                    functionSchema: z.object({
                        communities: z.array(z.object({
                            id: z.number(),
                            name: z.string(),
                            description: z.string(),
                            members: z.array(z.number())
                        }))
                    })
                };

            case GraphTask.EVALUATE_SEARCH:
                // console.log("EVALUATE_SEARCH data: ", data);
                const evaluateSearchPrompt = this.buildEvaluateSearchPrompt(data);
                // console.log("EVALUATE_SEARCH prompt: ", evaluateSearchPrompt);
                return {
                    prompt: evaluateSearchPrompt,
                    functionSchema: z.object({
                        relevance: z.number(),
                        confidence: z.number(),
                        reason: z.string()
                    })
                };

            case GraphTask.SUMMARIZE_NODE:
                // console.log("SUMMARIZE_NODE data: ", data);
                const summarizeNodePrompt = this.buildSummarizeNodePrompt({ 
                    nodeName: data.nodeName,
                    previousSummary: data.previousSummary,
                    context: data.context,
                    episodes: data.episodes
                });
                // console.log("SUMMARIZE_NODE prompt: ", summarizeNodePrompt);
                return {
                    prompt: summarizeNodePrompt,
                    functionSchema: z.object({
                        summary: z.string().max(500),
                        description: z.string().max(100),
                        key_points: z.array(z.string())
                    })
                };

            case GraphTask.INVALIDATE_EDGES:
                // console.log("INVALIDATE_EDGES data: ", data);   
                const invalidateEdgesPrompt = this.buildInvalidateEdgesPrompt(data);
                // console.log("INVALIDATE_EDGES prompt: ", invalidateEdgesPrompt);
                return {
                    prompt: invalidateEdgesPrompt,
                    functionSchema: z.object({
                        invalidatedEdges: z.array(z.string()),
                        reason: z.string()
                    })
                };

            case GraphTask.EXPAND_QUERY:
                // console.log("EXPAND_QUERY data: ", data);   
                const expandQueryPrompt = this.buildExpandQueryPrompt(data);
                // console.log("EXPAND_QUERY prompt: ", expandQueryPrompt);
                return {
                    prompt: expandQueryPrompt,
                    functionSchema: z.object({
                        expandedQuery: z.string(),
                        relatedTerms: z.array(z.string()),
                        expansionReason: z.string()
                    })
                };

            default:
                throw new Error(`Unknown task: ${task}`);
        }
    }

    private convertZodToJsonSchema(schema: z.ZodType<any>): Record<string, any> {
        // This is a simplified conversion - extend as needed
        if (schema instanceof z.ZodObject) {
            const shape = (schema as any)._def.shape();
            const properties: Record<string, any> = {};
            for (const [key, value] of Object.entries(shape)) {
                if (value instanceof z.ZodString) {
                    properties[key] = { type: 'string' };
                } else if (value instanceof z.ZodNumber) {
                    properties[key] = { type: 'number' };
                } else if (value instanceof z.ZodBoolean) {
                    properties[key] = { type: 'boolean' };
                } else if (value instanceof z.ZodArray) {
                    properties[key] = {
                        type: 'array',
                        items: this.convertZodToJsonSchema(value.element)
                    };
                } else if (value instanceof z.ZodObject) {
                    properties[key] = this.convertZodToJsonSchema(value);
                }
            }
            return {
                type: 'object',
                properties,
                required: Object.keys(shape)
            };
        } else if (schema instanceof z.ZodArray) {
            return {
                type: 'array',
                items: this.convertZodToJsonSchema(schema.element)
            };
        }
        // Add more cases as needed
        return { type: 'object' };
    }

    private buildEntityExtractionPrompt(input: { text: string, context: string }): string {
        return `Extract entities from the following conversation. For each entity:
- Generate a numeric ID (starting from 1)
- Identify the entity type (e.g., PERSON, ORGANIZATION, PRODUCT, LOCATION)
- Provide a brief summary if relevant

Current conversation:
${input.text}

${input.context ? `Previous context:\n${input.context}` : ''}

Extract entities that are important to understanding the conversation. Focus on:
1. People, organizations, and places mentioned
2. Products, services, or items being discussed
3. Key concepts or topics that are central to the conversation

Return entities in this format:
{
  "entities": [
    {
      "id": 1,  // Numeric ID
      "name": "Entity Name",
      "type": "ENTITY_TYPE",
      "summary": "Optional description"
    }
  ]
}`;
    }

    private buildTemporalExtractionPrompt(input: { text: string, context: string, referenceTimestamp: string, fact: string }): string {
        return `Extract entities and their relationships from the following conversation, including temporal information.

Current conversation:
${input.text}

${input.context ? `Previous context:\n${input.context}` : ''}

Reference timestamp: ${input.referenceTimestamp || 'Not provided'}

Guidelines:
1. Extract all important entities (people, products, organizations, etc.)
2. Identify relationships between entities
3. For each relationship, determine:
   - When it was established (valid_at)
   - When it ended, if applicable (invalid_at)
   - Use ISO 8601 format (YYYY-MM-DDTHH:MM:SS.SSSSSSZ)
   - Use the reference timestamp for present tense statements
   - Calculate actual dates for relative time mentions

Return in this format:
{
  "entities": [
    {
      "id": 1,  // Numeric ID
      "name": "Entity Name",
      "type": "ENTITY_TYPE",
      "summary": "Optional description"
    }
  ],
  "relationships": [
    {
      "sourceId": 1,  // Numeric ID referencing an entity
      "targetId": 2,  // Numeric ID referencing an entity
      "type": "RELATIONSHIP_TYPE",
      "name": "Optional name",
      "description": "Optional description",
      "valid_at": "2024-01-01T00:00:00.000Z",  // When relationship became true
      "invalid_at": null  // When relationship ended (if applicable)
    }
  ]
}`;
    }

    private buildDedupeNodesPrompt(input: { entities: any[], context: string }): string {
        return `<PREVIOUS_MESSAGES>\n${input.context}\n</PREVIOUS_MESSAGES>\n<ENTITIES>\n${JSON.stringify(input.entities, null, 2)}\n</ENTITIES>\nGiven the above ENTITIES and PREVIOUS MESSAGES. Determine if any of the entities are duplicates of each other.\n<EXPECTED_RESPONSE>\nReturn a JSON object with:\n{\n    "results": [\n        {\n            "isDuplicate": boolean,\n            "duplicateOf": "entity_id if duplicate, null if not"\n        }\n    ]\n}\n</EXPECTED_RESPONSE>`;
    }

    private buildSummarizeNodePrompt(input: { 
        nodeName: string, 
        previousSummary?: string, 
        context: string,
        episodes: any[]
    }): string {
        return `You are tasked with creating or updating a summary for an entity in our knowledge graph. Follow these guidelines:

1. Summary Creation:
   - Create a concise summary under 500 words
   - Focus ONLY on information about ${input.nodeName}
   - Use ONLY information from provided context and episodes
   - Maintain chronological order of events
   - Highlight key relationships and roles
   - Note temporal changes in status or relationships

2. Information Integration:
   ${input.previousSummary ? `
   - Previous Summary:
     ${input.previousSummary}
   - Merge new information with existing summary
   - Resolve any contradictions favoring newer information
   - Maintain important historical context` : `
   - Create new summary from available information
   - Focus on establishing baseline context
   - Note any temporal markers for future updates`}

3. Context Boundaries:
   - Only include explicitly stated information
   - Avoid speculation or inference
   - Note any significant gaps in information
   - Preserve temporal markers and dates

Context Information:
${input.context}

Conversation Episodes:
${JSON.stringify(input.episodes, null, 2)}

Return a JSON object with:
{
    "summary": "Comprehensive summary under 500 words",
    "description": "One-sentence description of the entity",
    "key_points": ["Array of key facts or developments"]
}`;
    }

    private buildInvalidateEdgesPrompt(data: {
        newEdge: IGraphEdge<any>;
        existingEdges: IGraphEdge<any>[];
        timestamp: Date;
    }): string {
        return `You are analyzing relationships in a knowledge graph to determine which edges should be invalidated based on new information.

Task: Analyze the new edge and existing edges to identify which existing edges should be invalidated.

New Edge (at ${data.timestamp.toISOString()}):
- From: ${data.newEdge.sourceId}
- To: ${data.newEdge.targetId}
- Type: ${data.newEdge.type}
- Content: ${JSON.stringify(data.newEdge.content)}

Existing Edges:
${data.existingEdges.map(edge => `- ID: ${edge.id}
  From: ${edge.sourceId}
  To: ${edge.targetId}
  Type: ${edge.type}
  Content: ${JSON.stringify(edge.content)}
  Valid Since: ${edge.validAt?.toISOString() || 'unknown'}`).join('\n')}

Consider:
1. Temporal conflicts (e.g., a person can't work at two companies simultaneously)
2. Logical conflicts (e.g., contradictory relationships)
3. Updates to existing information

Return a JSON object with:
{
    "invalidatedEdges": ["edge_id1", "edge_id2"],  // IDs of edges that should be invalidated
    "reason": "Explanation of why these edges were invalidated"
}`;
    }

    private buildExpandQueryPrompt(data: {
        query: string;
        context: string;
        recentEpisodes: IGraphNode<EpisodeContent>[];
    }): string {
        return `You are helping expand a search query to improve search results in a knowledge graph.

Task: Analyze the query and context to generate an expanded query with related terms.

Original Query: "${data.query}"
${data.context ? `Additional Context: ${data.context}` : ''}

Recent Episodes for Context:
${data.recentEpisodes.map(episode => 
    `- ${episode.validAt?.toISOString() || 'unknown'}: ${episode.content.body}`
).join('\n')}

Consider:
1. Synonyms and variations of terms
2. Related concepts based on context
3. Common patterns in recent episodes
4. Domain-specific terminology

Return a JSON object with:
{
    "expandedQuery": "Enhanced search query with OR conditions",
    "relatedTerms": ["term1", "term2"],  // List of related terms added
    "expansionReason": "Explanation of why these terms were added"
}

Example:
Input: "meetings with Bob"
Output: {
    "expandedQuery": "(meeting OR call OR discussion OR conversation) AND (Bob OR Robert OR Bobby)",
    "relatedTerms": ["call", "discussion", "conversation", "Robert", "Bobby"],
    "expansionReason": "Added synonyms for meetings and common variations of the name Bob"
}`;
    }

    private buildEvaluateSearchPrompt(data: { query: string; result: string; }): string {
        return `Evaluate the relevance of this search result to the query.

Query: "${data.query}"
Result: "${data.result}"

Consider:
1. Semantic relevance to the query
2. Temporal relevance if applicable
3. Contextual importance
4. Information completeness

Return a JSON object with:
{
    "relevance": <number between 0-1>,
    "confidence": <number between 0-1>,
    "reason": "Detailed explanation of the relevance score"
}

Example:
Query: "What was discussed in yesterday's meeting?"
Result: "In yesterday's team meeting, we discussed Q4 goals and project timelines"
{
    "relevance": 0.95,
    "confidence": 0.9,
    "reason": "The result directly answers the query, providing specific meeting content from the correct timeframe"
}`;
    }

    private buildRefineCommunityPrompt(data: any): string {
        const { nodes, metadata } = data;
        return `Analyze the following entities and group them into meaningful communities based on their relationships and shared characteristics.

Entities:
${nodes.map((node: any) => `- ${node.content.name} (${node.metadata.get('entityType')}): ${node.content.summary || 'No summary'}`).join('\n')}

For each community:
1. Generate a numeric ID (starting from 1)
2. Give it a descriptive name
3. Provide a brief description of what connects these entities
4. List the member entity IDs (numeric IDs)

Guidelines:
- Focus on meaningful relationships and shared contexts
- Consider both direct and indirect relationships
- A single entity can belong to multiple communities
- Communities should have at least 2 members
- Don't force entities into communities if there's no clear connection

Return in this format:
{
  "communities": [
    {
      "id": 1,  // Numeric ID
      "name": "Community Name",
      "description": "What connects these entities",
      "members": [1, 2, 3]  // Array of numeric entity IDs
    }
  ]
}`;
    }

    private getFunctionName(task: GraphTask): string {
        switch (task) {
            case GraphTask.REFINE_COMMUNITIES:
                return 'refineCommunities';
            case GraphTask.EXTRACT_TEMPORAL:
                return 'extractTemporal';
            case GraphTask.PREPARE_FOR_EMBEDDING:
                return 'prepareForEmbedding';
            case GraphTask.SUMMARIZE_CHUNK:
                return 'summarizeChunk';
            case GraphTask.COMBINE_SUMMARIES:
                return 'combineSummaries';
            case GraphTask.SUMMARIZE_NODE:
                return 'summarizeNode';
            default:
                return 'unknown';
        }
    }

    async processWithLLM(task: GraphTask, data: any): Promise<any> {
        const request = this.prepareRequest(task, data);

        // Use retry logic with exponential backoff
        const llmCall = async () => {
            const baseConfig: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
                model: this.config.model,
                messages: [
                    { role: 'system', content: 'You are a helpful assistant that processes graph operations. Always use the provided function to return your response.' },
                    { role: 'user', content: request.prompt }
                ],
                tools: [{
                    type: 'function',
                    function: {
                        name: this.getFunctionName(task),
                        parameters: this.convertZodToJsonSchema(request.functionSchema)
                    }
                }],
                tool_choice: { type: 'function', function: { name: this.getFunctionName(task) } },
                stream: false
            };

            const response = await this.llm.chat.completions.create(baseConfig);
            const message = response.choices[0].message;
            const finishReason = response.choices[0].finish_reason;
            const isToolCalls = finishReason === 'tool_calls';

            if (!isToolCalls || !message.tool_calls) {
                throw new Error('No tool calls in response');
            }

            const toolCall = message.tool_calls[0];
            // Pretty print the raw LLM response
            console.log('\nRaw LLM Response:');
            console.log(JSON.stringify(JSON.parse(toolCall.function.arguments), null, 2));

            return JSON.parse(toolCall.function.arguments);
        };

        try {
            const result = await retry(llmCall, 3, 1000);
            return result;
        } catch (error) {
            console.error("LLM call failed after multiple retries:", error);
            throw error;
        }
    }

    async extractTemporal(data: any): Promise<{ entities: any[], relationships: any[] }> {
        try {
            const { valid_at, invalid_at } = await this.processWithLLM(
                GraphTask.EXTRACT_TEMPORAL,
                { text: data.text, context: data.context, referenceTimestamp: data.metadata?.timestamp?.toISOString(), fact: data.fact }
            );

            console.log("Extracted valid_at:", valid_at);
            console.log("Extracted invalid_at:", invalid_at);

            return { entities: [], relationships: [] };
        } catch (error) {
            console.error("Error in extractTemporal:", error);
            return { entities: [], relationships: [] };
        }
    }

    private async extractTemporalRelationships(messages: Array<Message>): Promise<any> {
        const data = {
          text: messages.map(msg => `${msg.role}: ${msg.body}`).join('\n'),
          context: messages[0].context,
          prompt: `Extract temporal relationships between entities from the following conversation. For each relationship:
- Use entity IDs with 'entity_' prefix (e.g., 'entity_1', 'entity_2')
- Specify the relationship type
- Provide a name and description
- Include temporal information (valid_at, invalid_at)

Current conversation:
${messages.map(msg => `${msg.role}: ${msg.body}`).join('\n')}

Return relationships in this format:
{
  "entities": [
    {
      "id": "entity_1",  // Entity ID with prefix
      "name": "Entity Name",
      "type": "ENTITY_TYPE",
      "summary": "Optional description"
    }
  ],
  "relationships": [
    {
      "sourceId": "entity_1",  // Source entity ID with prefix
      "targetId": "entity_2",  // Target entity ID with prefix
      "type": "RELATIONSHIP_TYPE",
      "name": "Relationship Name",
      "description": "Optional description",
      "valid_at": "ISO timestamp",
      "invalid_at": "ISO timestamp or null"
    }
  ]
}

Extract relationships that show:
1. How entities are connected
2. When these connections were established or changed
3. Any temporal aspects of the relationships

Focus on meaningful relationships that help understand:
- User interactions with products/services
- Connections between different entities
- Changes in relationships over time`
        };

        return this.processWithLLM(GraphTask.EXTRACT_TEMPORAL, data);
    }
}
