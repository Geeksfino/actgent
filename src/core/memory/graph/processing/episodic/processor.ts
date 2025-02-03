import { z } from 'zod';
import { GraphTask, LLMConfig } from '../../types';

const DEFAULT_CONFIG: LLMConfig = {
    model: 'gpt-4',
    temperature: 0.0,
    maxTokens: 1000
};

/**
 * LLM processor for graph operations
 */
export class GraphLLMProcessor {
    constructor(
        private llm: any, // OpenAI-compatible client
        private config: LLMConfig = DEFAULT_CONFIG
    ) {}

    /**
     * Process a graph task using LLM
     */
    async process<T>(task: GraphTask, data: any): Promise<T> {
        const { prompt, functionSchema } = this.prepareRequest(task, data);
        
        const response = await this.llm.createChatCompletion({
            ...this.config,
            messages: [{ role: 'user', content: prompt }],
            functions: [{
                name: this.getFunctionName(task),
                parameters: functionSchema
            }],
            function_call: { name: this.getFunctionName(task) }
        });

        const result = JSON.parse(response.choices[0].message.function_call.arguments);
        return result;
    }

    private prepareRequest(task: GraphTask, data: any): { prompt: string; functionSchema: z.ZodType<any> } {
        switch (task) {
            case GraphTask.REFINE_COMMUNITIES:
                return {
                    prompt: this.buildEntityExtractionPrompt(`Refine the following graph communities:\n${JSON.stringify(data)}`),
                    functionSchema: z.object({ name: z.string(), type: z.string(), summary: z.string() })
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
                    prompt: this.buildEntityExtractionPrompt(data.prompt),
                    functionSchema: z.object({ name: z.string(), type: z.string(), summary: z.string() })
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
                    prompt: this.buildTemporalExtractionPrompt({ fact: data.fact, referenceTimestamp: data.referenceTimestamp }),
                    functionSchema: z.object({ valid_at: z.string().nullable(), invalid_at: z.string().nullable() })
                };

            default:
                throw new Error(`Unknown task: ${task}`);
        }
    }

    private buildEntityExtractionPrompt(input: string): string {
        return `Guidelines:
1. Extract significant entities, concepts, or actors mentioned in the input
2. DO NOT create nodes for relationships or actions
3. DO NOT create nodes for temporal information like dates, times or years
4. Be as explicit as possible in entity names, using full names
5. Only extract entities that are clearly mentioned

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

    private buildTemporalExtractionPrompt(input: { fact: any, referenceTimestamp: string }): string {
        return `IMPORTANT: Only extract time information if it is part of the provided fact. Otherwise return null.

Definitions:
- valid_at: When the relationship became true or was established
- invalid_at: When the relationship stopped being true or ended

Guidelines:
1. Use ISO 8601 format (YYYY-MM-DDTHH:MM:SS.SSSSSSZ)
2. Use the reference timestamp for present tense facts
3. Calculate actual datetime for relative time mentions
4. Use 00:00:00 for date-only mentions
5. Use January 1st 00:00:00 for year-only mentions
6. Include timezone offset (Z for UTC if unspecified)
7. Return null if no explicit temporal information

Reference Timestamp: ${input.referenceTimestamp}

Fact:
${JSON.stringify(input.fact, null, 2)}

Required Output Format:
JSON object containing:
- valid_at: string (ISO 8601) | null
- invalid_at: string (ISO 8601) | null`;
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

    private getFunctionName(task: GraphTask): string {
        switch (task) {
            case GraphTask.REFINE_COMMUNITIES:
                return 'refine_communities';
            case GraphTask.EVALUATE_PATHS:
                return 'evaluate_paths';
            case GraphTask.RERANK_RESULTS:
                return 'update_search_ranks';
            case GraphTask.EXTRACT_TEMPORAL:
                return 'extract_temporal';
            case GraphTask.PREPARE_FOR_EMBEDDING:
                return 'prepare_for_embedding';
            case GraphTask.CONSOLIDATE_EPISODES:
                return 'consolidate_episodes';
            case GraphTask.DEDUPE_NODE:
                return 'dedupe_node';
            case GraphTask.DEDUPE_EDGE:
                return 'dedupe_edge';
            case GraphTask.DEDUPE_BATCH:
                return 'dedupe_batch';
            case GraphTask.DEDUPE_BATCH_EDGES:
                return 'dedupe_batch_edges';
            default:
                throw new Error(`Unknown task: ${task}`);
        }
    }
}
