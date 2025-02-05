import { z } from 'zod';
import { GraphTask, LLMConfig } from '../../types';
import { IGraphNode, IGraphEdge, EpisodeContent } from '../../data/types';
import OpenAI from 'openai';

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
        const { prompt, functionSchema } = this.prepareRequest(task, data);
        
        const baseConfig: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
            model: this.config.model,
            messages: [
                { role: 'system', content: 'You are a helpful assistant that processes graph operations. Always use the provided function to return your response.' },
                { role: 'user', content: prompt }
            ],
            tools: [{
                type: 'function',
                function: {
                    name: this.getFunctionName(task),
                    parameters: this.convertZodToJsonSchema(functionSchema)
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
        return JSON.parse(toolCall.function.arguments);
    }

    private prepareRequest(task: GraphTask, data: any): { prompt: string; functionSchema: z.ZodType<any> } {
        switch (task) {
            case GraphTask.REFINE_COMMUNITIES:
                return {
                    prompt: this.buildEntityExtractionPrompt(`Refine the following graph communities:\n${JSON.stringify(data)}`),
                    functionSchema: z.object({ name: z.string(), type: z.string(), summary: z.string() })
                };
            
            case GraphTask.LABEL_COMMUNITY:
                return {
                    prompt: this.buildPrompt(`Generate a descriptive label for this community of nodes:\n${JSON.stringify(data.nodes)}\nProvide a concise label and confidence score.`),
                    functionSchema: z.object({
                        label: z.string(),
                        confidence: z.number().min(0).max(1)
                    })
                };

            case GraphTask.EVALUATE_PATHS:
                return {
                    prompt: this.buildFactExtractionPrompt({ text: `Evaluate paths between nodes:\n${JSON.stringify(data)}`, entities: data.entities }),
                    functionSchema: z.object({ source_entity: z.string(), target_entity: z.string(), relation_type: z.string(), description: z.string() })
                };
            
            case GraphTask.RERANK_RESULTS:
                return {
                    prompt: this.buildEntityExtractionPrompt(`Rerank search results for query "${data.query}":\n${JSON.stringify(data.nodes)}`),
                    functionSchema: z.object({ name: z.string(), type: z.string(), summary: z.string() })
                };

            case GraphTask.PREPARE_FOR_EMBEDDING:
                return {
                    prompt: this.buildPrompt(`Prepare text for embedding:\n${JSON.stringify(data)}`),
                    functionSchema: z.array(z.number())
                };

            case GraphTask.DEDUPE_NODE:
                return {
                    prompt: this.buildDedupePrompt({ newNode: data.newNode, existingNodes: data.existingNodes, context: data.context }),
                    functionSchema: z.object({
                        is_duplicate: z.boolean(),
                        uuid: z.string().nullable(),
                        name: z.string(),
                        confidence: z.number().min(0).max(1)
                    })
                };

            case GraphTask.DEDUPE_EDGE:
                return {
                    prompt: this.buildFactExtractionPrompt({ text: data.prompt, entities: data.entities }),
                    functionSchema: z.object({ source_entity: z.string(), target_entity: z.string(), relation_type: z.string(), description: z.string() })
                };

            case GraphTask.DEDUPE_BATCH:
                return {
                    prompt: this.buildEntityExtractionPrompt(data.prompt),
                    functionSchema: z.array(z.object({ name: z.string(), type: z.string(), summary: z.string() }))
                };

            case GraphTask.DEDUPE_BATCH_EDGES:
                return {
                    prompt: this.buildFactExtractionPrompt({ text: data.prompt, entities: data.entities }),
                    functionSchema: z.array(z.object({ source_entity: z.string(), target_entity: z.string(), relation_type: z.string(), description: z.string() }))
                };

            case GraphTask.EXTRACT_TEMPORAL:
                return {
                    prompt: this.buildTemporalExtractionPrompt({ text: data.text, context: data.context, referenceTimestamp: data.referenceTimestamp }),
                    functionSchema: z.object({
                        entities: z.array(z.object({
                            id: z.string(),
                            name: z.string(),
                            type: z.string(),
                            summary: z.string().optional()
                        })),
                        relationships: z.array(z.object({
                            id: z.string(),
                            sourceId: z.string(),
                            targetId: z.string(),
                            description: z.string(),
                            isTemporary: z.boolean().optional()
                        }))
                    })
                };

            case GraphTask.EVALUATE_SEARCH:
                return {
                    prompt: this.buildEvaluateSearchPrompt(data),
                    functionSchema: z.object({
                        relevance: z.number(),
                        confidence: z.number(),
                        reason: z.string()
                    })
                };

            case GraphTask.SUMMARIZE_NODE:
                return {
                    prompt: this.buildSummarizeNodePrompt({ 
                        nodeName: data.nodeName,
                        previousSummary: data.previousSummary,
                        context: data.context,
                        episodes: data.episodes
                    }),
                    functionSchema: z.object({
                        summary: z.string().max(500),
                        description: z.string().max(100),
                        key_points: z.array(z.string())
                    })
                };

            case GraphTask.INVALIDATE_EDGES:
                return {
                    prompt: this.buildInvalidateEdgesPrompt(data),
                    functionSchema: z.object({
                        invalidatedEdges: z.array(z.string()),
                        reason: z.string()
                    })
                };

            case GraphTask.EXPAND_QUERY:
                return {
                    prompt: this.buildExpandQueryPrompt(data),
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
        return `Given the text, extract entities that are explicitly or implicitly mentioned:

Guidelines:
1. ALWAYS extract the speaker/actor as the first node
2. Extract significant entities that are:
   - Physical objects or items
   - People, organizations, or groups
   - Concepts, topics, or subjects
   - Locations or places
3. For each entity:
   - Use full, explicit names
   - Include a brief summary for context
   - Assign a general type (PERSON, OBJECT, CONCEPT, LOCATION, ORGANIZATION)
4. DO NOT create nodes for:
   - Actions or verbs
   - Temporal information (dates, times)
   - Attributes or properties
   - Relationships between entities

For relationships between entities:
1. Only connect DISTINCT entities
2. Use generic, descriptive ALL_CAPS types (HAS, USES, NEEDS, PART_OF, etc.)
3. Include detailed descriptions with context
4. Note if relationships are temporary based on the reference timestamp (${input.referenceTimestamp})

Previous Context (DO NOT extract from this):
${input.context}

Current Text to Process:
${input.text}

Return a JSON object with:
1. entities: Array of {id, name, type, summary}
2. relationships: Array of {id, sourceId, targetId, type, description, isTemporary}`;
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
            default:
                throw new Error(`Unknown task: ${task}`);
        }
    }
}
