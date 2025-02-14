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
                mention: z.string(),
                type: z.string(),
                confidence: z.number().min(0).max(1)
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

            // Add spans for entity extraction tasks
            if (task === GraphTask.EXTRACT_ENTITIES) {
                return await this.processEntityExtractionResults(data.text, rawResponse, data.episodeId) as T;
            }

            return rawResponse as T;
        } catch (error) {
            console.error("LLM call failed after multiple retries:", error);
            throw error;
        }
    }

    private prepareRequest(task: GraphTask, data: any): { prompt: string; functionSchema: z.ZodType<any> } {
        switch (task) {
            case GraphTask.EXTRACT_ENTITIES:
                console.log("EXTRACT_ENTITIES data: ", data);
                const extractEntitiesPrompt = this.buildEntityExtractionPrompt({ text: data.text, context: data.context });
                console.log("EXTRACT_ENTITIES prompt: ", extractEntitiesPrompt);
                return {
                    prompt: extractEntitiesPrompt,
                    functionSchema: z.object({
                        entities: z.array(z.object({
                            id: z.number(),
                            mention: z.string(),        // The exact text as mentioned
                            type: z.string(),           // Entity type (Person, Book, etc.)
                            confidence: z.number().min(0).max(1)
                        }))
                    })
                };

            case GraphTask.EXTRACT_TEMPORAL:
                const extractTemporalPrompt = this.buildTemporalExtractionPrompt({ text: data.text, context: data.context, referenceTimestamp: data.metadata?.timestamp?.toISOString(), fact: data.fact });
                return {
                    prompt: extractTemporalPrompt,
                    functionSchema: z.object({
                        relationships: z.array(z.object({
                            sourceId: z.number(),
                            targetId: z.number(),
                            type: z.string(),
                            episode_id: z.string(),     // Link to source episode
                            confidence: z.number().min(0).max(1),
                            valid_at: z.string().nullable(),
                            invalid_at: z.string().nullable()
                        }))
                    })
                };

            case GraphTask.REFINE_COMMUNITIES:
                const refineCommunityPrompt = this.buildRefineCommunityPrompt(data);
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
                const evaluateSearchPrompt = this.buildEvaluateSearchPrompt(data);
                return {
                    prompt: evaluateSearchPrompt,
                    functionSchema: z.object({
                        relevance: z.number(),
                        confidence: z.number(),
                        reason: z.string()
                    })
                };

            case GraphTask.SUMMARIZE_NODE:
                const summarizeNodePrompt = this.buildSummarizeNodePrompt({ 
                    nodeName: data.nodeName,
                    previousSummary: data.previousSummary,
                    context: data.context,
                    episodes: data.episodes
                });
                return {
                    prompt: summarizeNodePrompt,
                    functionSchema: z.object({
                        summary: z.string().max(500),
                        description: z.string().max(100),
                        key_points: z.array(z.string())
                    })
                };

            case GraphTask.INVALIDATE_EDGES:
                const invalidateEdgesPrompt = this.buildInvalidateEdgesPrompt(data);
                return {
                    prompt: invalidateEdgesPrompt,
                    functionSchema: z.object({
                        invalidatedEdges: z.array(z.string()),
                        reason: z.string()
                    })
                };

            case GraphTask.EXPAND_QUERY:
                const expandQueryPrompt = this.buildExpandQueryPrompt(data);
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
        return `Extract entities and their relationships from the following conversation. The goal is to create a knowledge graph where entities are nodes and relationships are edges between them.

Current conversation:
${input.text}

${input.context ? `Previous context:\n${input.context}` : ''}

Guidelines:

** Entity Extraction: **

1. Extract entities that are significant to understanding the conversation. Focus on:
   - PERSON (people, including aliases and full names)
   - ORGANIZATION (companies, institutions, groups)
   - PRODUCT (books, artworks, inventions)
   - LOCATION (places, regions, countries)
   - CONCEPT (important ideas, theories, or abstract concepts)

2. For each entity:
   - Use the most complete and descriptive mention from the text (e.g., "Eric Arthur Blair" instead of just "Eric")
   - Assign a high confidence (0.9-1.0) for clear, unambiguous mentions
   - Assign a lower confidence (0.7-0.8) for inferred or ambiguous mentions


3. Entity Guidelines:
   - DO extract entities mentioned in the current message
   - DO NOT extract entities only mentioned in previous context
   - DO NOT create nodes for relationships or actions
   - DO NOT create nodes for temporal information (dates, times)
   - DO merge multiple mentions of the same entity into a single entity object

** Relationship Extraction: **

1. For each entity, identify its relationships with other entities in the CURRENT message:
   - Each relationship should have a clear type (e.g., "wrote", "worked_for", "located_in")
   - Each relationship should point to another entity by its ID
   - Include a confidence score for the relationship
   - Add temporal context if present in the text

2. Relationship Structure:
   {
     "relationships": {
       "relationship_type": [{
         "target": target_entity_id,
         "confidence": 0.9,
         "metadata": {
           "temporal_context": "optional timestamp or period"
         }
       }]
     }
   }

Return the extracted information in this format:
{
  "entities": [
    {
      "id": 1,
      "mention": "Entity's full mention text",
      "type": "ENTITY_TYPE",
      "confidence": 0.9,
      "relationships": {
        "relationship_type": [{
          "target": 2,
          "confidence": 0.9,
          "metadata": {
            "temporal_context": "optional"
          }
        }]
      }
    }
  ]
}`;
    }

    private buildTemporalExtractionPrompt(input: { text: string, context: string, referenceTimestamp: string, fact: string }): string {
        return `Extract temporal relationships from the conversation. For each turn in the conversation:
1. Identify relationships between existing entities, including:
   - ALSO_KNOWN_AS: alternate names or aliases
   - IS_A: class or category relationships
   - HAS_PROFESSION: professional relationships
   - HAS_NATIONALITY: nationality or origin
   - PART_OF: membership or containment
   - LOCATED_IN: geographical relationships
2. For each relationship:
   - Assign a confidence score (0-1)
   - Track which turn it appeared in
   - Note any temporal context

Example output:
{
  "relationships": [
    {
      "sourceId": 1,
      "targetId": 2,
      "type": "ALSO_KNOWN_AS",
      "confidence": 0.9,
      "turn": 0,
      "temporalContext": {"timestamp": "2024-01-01T00:00:00Z", "type": "MENTION"}
    },
    {
      "sourceId": 1,
      "targetId": 3,
      "type": "HAS_PROFESSION",
      "confidence": 0.85,
      "turn": 1,
      "temporalContext": {"timestamp": "2024-01-01T00:00:00Z", "type": "MENTION"}
    },
    {
      "sourceId": 1,
      "targetId": 4,
      "type": "HAS_NATIONALITY",
      "confidence": 0.9,
      "turn": 1,
      "temporalContext": {"timestamp": "2024-01-01T00:00:00Z", "type": "MENTION"}
    }
  ]
}

Text to process:
${input.text}

Context (previous conversation):
${input.context}

Extract temporal relationships in the exact JSON format shown above:`;
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
    `- ${episode.validAt?.toISOString() || 'unknown'}: ${episode.content.content}`
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

    async extractTemporal(data: any): Promise<{ relationships: any[] }> {
        const result = await this.processWithLLM(GraphTask.EXTRACT_TEMPORAL, data);
        return { relationships: result.relationships };
    }

    private async processEntityExtractionResults(text: string, result: any, sessionId: string): Promise<any> {
        interface ProcessedEntity {
            id: number;
            mention: string;
            type: string;
            confidence: number;
            metadata: {
                episodeId: string;
                sessionId: string;
                turnId: string;
            };
        }
        
        const processedEntities: ProcessedEntity[] = [];
        const mentionedEntitiesByTurn = new Map<string, Set<string>>();
        
        // Split text into turns
        const turns = text.split(/\[Turn \d+\]\n/);
        turns.shift(); // Remove the empty string before the first turn marker
        
        const BATCH_SIZE = 4; // Each episode contains 4 messages (2 turns)
        
        for (const entity of result.entities) {
            // For each entity, process it once per turn it appears in
            turns.forEach((turnText, turnIndex) => {
                // Calculate episode batch index
                const episodeBatchIndex = Math.floor(turnIndex / 2); // 2 turns per episode
                
                // Generate IDs using new :: separator format
                const turnId = `${sessionId}::turn_${turnIndex}::${turnIndex * 2}`; // Simple turn ID format
                const episodeId = `${sessionId}::${episodeBatchIndex}`;
                
                // Initialize the Set for this turn if it doesn't exist
                if (!mentionedEntitiesByTurn.has(turnId)) {
                    mentionedEntitiesByTurn.set(turnId, new Set<string>());
                }
                
                // Create a unique key for the entity based on its mention and type
                const entityKey = `${entity.mention}-${entity.type}`;
                
                // Check if the entity has already been mentioned in this turn
                const turnEntities = mentionedEntitiesByTurn.get(turnId)!;
                if (!turnEntities.has(entityKey)) {
                    processedEntities.push({
                        ...entity,
                        metadata: {
                            episodeId,
                            sessionId,
                            turnId
                        }
                    });
                    
                    // Mark this entity as mentioned in this turn
                    turnEntities.add(entityKey);
                }
            });
        }
        
        return {
            ...result,
            entities: processedEntities
        };
    }

    /**
     * Helper function to determine which turn a span belongs to based on its position in the text
     */
    private getTurnIdFromSpan(text: string, span: { start: number; end: number }): string {
        // Split the text into turns based on the turn markers in the text
        const turns = text.split(/(?=\[Turn \d+\])/);
        let currentPosition = 0;
        
        for (let i = 0; i < turns.length; i++) {
            const turnLength = turns[i].length;
            if (span.start >= currentPosition && span.start < currentPosition + turnLength) {
                return `turn_${i}`;
            }
            currentPosition += turnLength;
        }
        
        return `turn_0`; // Default to turn 0 if we can't determine the turn
    }
}
