import { z } from 'zod';
import { GraphTask, LLMConfig } from '../../types';
import { IGraphNode, IGraphEdge, EpisodeContent } from '../../data/types';
import OpenAI from 'openai';
import { retry } from "/Users/cliang/repos/clipforge/actgent/src/core/utils/retry";

/**
 * LLM processor for graph operations
 */
export class GraphLLMProcessor {
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
            case GraphTask.REFINE_COMMUNITIES:
                console.log("REFINE_COMMUNITIES data: ", data);
                const refineCommunitiesPrompt = `Refine the following graph community (ID: ${data.community_id}) with members: ${JSON.stringify(data.nodes)}

                Guidelines:
                1. Analyze the community members and their connections.
                2. Identify any inconsistencies or inaccuracies in the community structure.
                3. Refine the community by adding or removing members as necessary.
                4. Provide a clear reason for any changes made.

                Required Output Format:
                JSON object with:
                - community_id: string
                - updated_members: array of strings
                - reason: string (optional)`;
                console.log("REFINE_COMMUNITIES prompt: ", refineCommunitiesPrompt);
                return {
                    prompt: refineCommunitiesPrompt,
                    functionSchema: z.object({
                        community_id: z.string(),
                        updated_members: z.array(z.string()),
                        reason: z.string().optional()
                    })
                };
            
            case GraphTask.LABEL_COMMUNITY:
                console.log("LABEL_COMMUNITY data: ", data);
                const labelCommunityPrompt = this.buildPrompt(`Generate a descriptive label for this community of nodes:\n${JSON.stringify(data.nodes)}\nProvide a concise label and confidence score.`);
                console.log("LABEL_COMMUNITY prompt: ", labelCommunityPrompt);
                return {
                    prompt: labelCommunityPrompt,
                    functionSchema: z.object({
                        label: z.string(),
                        confidence: z.number().min(0).max(1)
                    })
                };

            case GraphTask.EVALUATE_PATHS:
                console.log("EVALUATE_PATHS data: ", data);
                const evaluatePathsPrompt = this.buildFactExtractionPrompt({ text: `Evaluate paths between nodes:\n${JSON.stringify(data)}`, entities: data.entities });
                console.log("EVALUATE_PATHS prompt: ", evaluatePathsPrompt);
                return {
                    prompt: evaluatePathsPrompt,
                    functionSchema: z.object({ source_entity: z.string(), target_entity: z.string(), relation_type: z.string(), description: z.string() })
                };
            
            case GraphTask.RERANK_RESULTS:
                console.log("RERANK_RESULTS data: ", data);
                const rerankResultsPrompt = this.buildEntityExtractionPrompt(`Rerank search results for query "${data.query}":\n${JSON.stringify(data.nodes)}`);
                console.log("RERANK_RESULTS prompt: ", rerankResultsPrompt);
                return {
                    prompt: rerankResultsPrompt,
                    functionSchema: z.object({ name: z.string(), type: z.string(), summary: z.string() })
                };

            case GraphTask.PREPARE_FOR_EMBEDDING:
                console.log("PREPARE_FOR_EMBEDDING data: ", data);
                const prepareForEmbeddingPrompt = this.buildPrompt(`Prepare text for embedding:\n${JSON.stringify(data)}`);
                console.log("PREPARE_FOR_EMBEDDING prompt: ", prepareForEmbeddingPrompt);
                return {
                    prompt: prepareForEmbeddingPrompt,
                    functionSchema: z.array(z.number())
                };

            case GraphTask.DEDUPE_NODE:
                console.log("DEDUPE_NODE data: ", data);
                const dedupeNodePrompt = this.buildDedupePrompt({ newNode: data.newNode, existingNodes: data.existingNodes, context: data.context });
                console.log("DEDUPE_NODE prompt: ", dedupeNodePrompt);
                return {
                    prompt: dedupeNodePrompt,
                    functionSchema: z.object({
                        is_duplicate: z.boolean(),
                        uuid: z.string().nullable(),
                        name: z.string(),
                        confidence: z.number().min(0).max(1)
                    })
                };

            case GraphTask.DEDUPE_EDGE:
                console.log("DEDUPE_EDGE data: ", data);
                const dedupeEdgePrompt = this.buildFactExtractionPrompt({ text: data.prompt, entities: data.entities });
                console.log("DEDUPE_EDGE prompt: ", dedupeEdgePrompt);
                return {
                    prompt: dedupeEdgePrompt,
                    functionSchema: z.object({ source_entity: z.string(), target_entity: z.string(), relation_type: z.string(), description: z.string() })
                };

            case GraphTask.DEDUPE_BATCH:
                console.log("DEDUPE_BATCH data: ", data);
                const dedupeBatchPrompt = this.buildEntityExtractionPrompt(data.prompt);
                console.log("DEDUPE_BATCH prompt: ", dedupeBatchPrompt);
                return {
                    prompt: dedupeBatchPrompt,
                    functionSchema: z.array(z.object({ name: z.string(), type: z.string(), summary: z.string() }))
                };

            case GraphTask.DEDUPE_BATCH_EDGES:
                console.log("DEDUPE_BATCH_EDGES data: ", data);
                const dedupeBatchEdgesPrompt = this.buildFactExtractionPrompt({ text: data.prompt, entities: data.entities });
                console.log("DEDUPE_BATCH_EDGES prompt: ", dedupeBatchEdgesPrompt);
                return {
                    prompt: dedupeBatchEdgesPrompt,
                    functionSchema: z.array(z.object({ source_entity: z.string(), target_entity: z.string(), relation_type: z.string(), description: z.string() }))
                };

            case GraphTask.EXTRACT_TEMPORAL:
                console.log("EXTRACT_TEMPORAL data: ", data);
                const extractTemporalPrompt = this.buildTemporalExtractionPrompt({ text: data.text, context: data.context, referenceTimestamp: data.referenceTimestamp });
                console.log("EXTRACT_TEMPORAL prompt: ", extractTemporalPrompt);
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
                            id: z.number(),
                            sourceId: z.number(),
                            targetId: z.number(),
                            type: z.string(),
                            description: z.string(),
                            isTemporary: z.boolean().optional()
                        }))
                    })
                };

            case GraphTask.EVALUATE_SEARCH:
                console.log("EVALUATE_SEARCH data: ", data);
                const evaluateSearchPrompt = this.buildEvaluateSearchPrompt(data);
                console.log("EVALUATE_SEARCH prompt: ", evaluateSearchPrompt);
                return {
                    prompt: evaluateSearchPrompt,
                    functionSchema: z.object({
                        relevance: z.number(),
                        confidence: z.number(),
                        reason: z.string()
                    })
                };

            case GraphTask.SUMMARIZE_NODE:
                console.log("SUMMARIZE_NODE data: ", data);
                const summarizeNodePrompt = this.buildSummarizeNodePrompt({ 
                    nodeName: data.nodeName,
                    previousSummary: data.previousSummary,
                    context: data.context,
                    episodes: data.episodes
                });
                console.log("SUMMARIZE_NODE prompt: ", summarizeNodePrompt);
                return {
                    prompt: summarizeNodePrompt,
                    functionSchema: z.object({
                        summary: z.string().max(500),
                        description: z.string().max(100),
                        key_points: z.array(z.string())
                    })
                };

            case GraphTask.INVALIDATE_EDGES:
                console.log("INVALIDATE_EDGES data: ", data);
                const invalidateEdgesPrompt = this.buildInvalidateEdgesPrompt(data);
                console.log("INVALIDATE_EDGES prompt: ", invalidateEdgesPrompt);
                return {
                    prompt: invalidateEdgesPrompt,
                    functionSchema: z.object({
                        invalidatedEdges: z.array(z.string()),
                        reason: z.string()
                    })
                };

            case GraphTask.EXPAND_QUERY:
                console.log("EXPAND_QUERY data: ", data);
                const expandQueryPrompt = this.buildExpandQueryPrompt(data);
                console.log("EXPAND_QUERY prompt: ", expandQueryPrompt);
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

    private buildEntityExtractionPrompt(input: string): string {
        return `Guidelines:
1. Extract significant entities, concepts, or actors mentioned in the input
2. DO NOT create nodes for relationships or actions
3. DO NOT create nodes for temporal information like dates, times or years
4. Be as explicit as possible in entity names, using full names
5. Only extract entities that are clearly mentioned

Definitions:
- entity: a unique named instance (person, place, organization)
- category: the type or classification of the entity
- context: relevant surrounding information or metadata

Required Output Format:
JSON array of objects, each containing:
- name: string (full, explicit name of the entity)
- type: string (category of the entity)
- summary: string (brief description or context)

Input:
${input}`;
    }

    private buildFactExtractionPrompt(input: { text: string, entities: any[] }): string {
        return `Guidelines:
1. Extract facts only between the provided entities
2. Each fact should represent a clear relationship between two DISTINCT entities
3. Use concise, all-caps relation types (e.g., LOVES, IS_FRIENDS_WITH, WORKS_FOR)
4. Include all relevant contextual information in the fact description
5. Consider temporal aspects when relevant

Entities:
${JSON.stringify(input.entities, null, 2)}

Required Output Format:
JSON array of objects, each containing:
- source_entity: string
- target_entity: string
- relation_type: string (ALL_CAPS)
- description: string (detailed fact with context)

Input:
${input.text}`;
    }

    private buildTemporalExtractionPrompt(input: { text: string, context: string, referenceTimestamp: string }): string {
        return `Extract entities and their relationships from the given text and context. Follow these guidelines:

For entities:
1. Identify key entities including:
   - People
   - Objects (physical items, products)
   - Concepts (abstract ideas, activities)
   - Places
   - Organizations
   - Temporal information (dates, times)
   - Attributes or properties

2. For each entity:
   - Use numeric IDs starting from 1
   - Provide a descriptive name
   - Use ALL_CAPS type (PERSON, OBJECT, CONCEPT, PLACE, ORGANIZATION)
   - Include a summary that captures the entity's role or significance

For relationships:
1. Only connect DISTINCT entities
2. Use natural language relationship types in ALL_CAPS that describe the connection (e.g., IS_INTERESTED_IN, HAS_FEATURE, USES, IS_SUITABLE_FOR)
3. Include detailed descriptions with context
4. Note if relationships are temporary based on the reference timestamp (${input.referenceTimestamp})
5. Use numeric IDs starting from 1
6. Consider relationships between current text and context entities (entity linking)

Previous Context:
${input.context}

Current Text to Process:
${input.text}

Return a JSON object with:
1. entities: Array of {id: number, name: string, type: string, summary: string}
2. relationships: Array of {id: number, sourceId: number, targetId: number, type: string, description: string, isTemporary: boolean}`;
    }

    private buildPrompt(input: string): string {
        return `Guidelines:
- Extract key entities from the input text
- Include only significant, well-defined entities
- Identify proper names, organizations, dates, and key terms
- Ensure each entity is distinct and non-redundant

Definitions:
- entity: a unique named instance (person, place, organization)
- category: the type or classification of the entity
- context: relevant surrounding information or metadata

Required Output Format:
JSON array of objects, each containing:
- entity: string
- category: string
- context: string

Input text:
${input}`;
    }

    private buildQAPrompt(input: { question: string, context: string }): string {
        return `You are tasked with answering a question based on provided context. Follow these guidelines:

1. Answer Generation:
   - Use ONLY information from the provided context
   - If answer cannot be determined from context, clearly state the limitations
   - Maintain factual accuracy and avoid speculation
   - Consider temporal aspects (when events occurred)
   - Be concise but complete
   - Format your answer in first person if the context is about you

2. Context Evaluation:
   - Focus on entity summaries and facts from context
   - Consider relationships between entities
   - Pay attention to temporal information
   - Only use information explicitly stated

3. Response Format:
   - Start with a clear, direct answer
   - Support with relevant facts from context
   - Note any uncertainty or missing information
   - Keep response focused and relevant to question

Question: ${input.question}

Available Context:
${input.context}

Return a JSON object with a single "answer" field containing your response.`;
    }

    private buildDedupePrompt(input: { newNode: any, existingNodes: any[], context: string }): string {
        return `You are tasked with identifying duplicate entities in our knowledge graph. Follow these guidelines:

1. Duplicate Detection:
   - Compare both names and summaries of nodes
   - Consider variations in naming (nicknames, abbreviations)
   - Check for contextual clues that indicate same entity
   - Evaluate temporal consistency
   - Consider relationships with other entities

2. Name Resolution:
   - When duplicates found, choose most complete name
   - Preserve full names over partial names
   - Maintain consistent naming conventions
   - Combine information if both names add value

3. Response Requirements:
   - Determine if new node matches any existing node
   - If match found, provide existing node's UUID
   - Suggest best name based on all available information
   - Include confidence level in match

Previous Context:
${input.context}

Existing Nodes:
${JSON.stringify(input.existingNodes, null, 2)}

New Node to Check:
${JSON.stringify(input.newNode, null, 2)}

Return a JSON object with:
{
    "is_duplicate": boolean,
    "uuid": "existing node UUID if duplicate, null if not",
    "name": "best name to use",
    "confidence": number between 0 and 1
}`;
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

    private getFunctionName(task: GraphTask): string {
        switch (task) {
            case GraphTask.EXTRACT_TEMPORAL:
                return 'extractTemporal';
            case GraphTask.DEDUPE_NODE:
                return 'dedupeNode';
            case GraphTask.SUMMARIZE_NODE:
                return 'summarizeNode';
            case GraphTask.INVALIDATE_EDGES:
                return 'invalidateEdges';
            case GraphTask.EXPAND_QUERY:
                return 'expandQuery';
            case GraphTask.EVALUATE_SEARCH:
                return 'evaluateSearch';
            case GraphTask.REFINE_COMMUNITIES:
                return 'refineCommunities';
            default:
                throw new Error(`Unknown task: ${task}`);
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
            const { entities, relationships } = await this.processWithLLM(
                GraphTask.EXTRACT_TEMPORAL,
                { text: data.text, context: data.context, referenceTimestamp: data.referenceTimestamp }
            );

            console.log("Extracted entities:", entities);
            console.log("Extracted relationships:", relationships);

            if (!entities || !Array.isArray(entities)) {
                console.warn("Invalid entities data received from LLM.", entities);
                return { entities: [], relationships: [] };
            }

            if (relationships && !Array.isArray(relationships)) {
                console.warn("Invalid relationships data received from LLM.", relationships);
                return { entities: [], relationships: [] };
            }

            return { entities, relationships };
        } catch (error) {
            console.error("Error in extractTemporal:", error);
            return { entities: [], relationships: [] };
        }
    }
}
