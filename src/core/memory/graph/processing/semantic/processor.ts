import { z } from 'zod';
import { GraphTask, LLMConfig } from '../../types';
import { IGraphNode } from '../../data/types';
import { OpenAI } from 'openai';
import * as crypto from 'crypto';

interface Relationship {
    id: number;
    sourceId: number;
    targetId: number;
    type: string;
    description: string;
    isTemporary: boolean;
    valid_at?: string;
    invalid_at?: string | null;
}

// Zod schemas for validation
const EntitySchema = z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    summary: z.string(),
    confidence: z.number().min(0).max(1).optional()
});

const MappingSchema = z.object({
    source_ids: z.array(z.string()),
    target_id: z.string(),
    confidence: z.number().min(0).max(1)
});

const DeduplicationResultSchema = z.object({
    entities: z.array(EntitySchema),
    mappings: z.array(MappingSchema)
});

const TemporalRelationshipSchema = z.object({
    id: z.number(),
    sourceId: z.number(),
    targetId: z.number(),
    type: z.string(),
    description: z.string(),
    isTemporary: z.boolean(),
    valid_at: z.string(),
    invalid_at: z.string().nullable(),
    confidence: z.number().min(0).max(1).optional()
});

const TemporalResultSchema = z.object({
    entities: z.array(EntitySchema),
    relationships: z.array(TemporalRelationshipSchema)
});

const FactExtractionSchema = z.object({
    entities: z.array(EntitySchema),
    relationships: z.array(z.object({
        id: z.number(),
        sourceId: z.number(),
        targetId: z.number(),
        type: z.string(),
        description: z.string(),
        isTemporary: z.boolean()
    }))
});

/**
 * Semantic graph processor for extracting entities and relationships from text
 */
export class SemanticGraphProcessor {
    private config: LLMConfig;
    private client: OpenAI;

    constructor(config: LLMConfig & { client: OpenAI }) {
        this.config = config;
        this.client = config.client;
    }

    /**
     * Process a task and return the result
     */
    async process(task: GraphTask, data: any): Promise<any> {
        switch (task) {
            case GraphTask.FACT_EXTRACTION:
                console.log("FACT_EXTRACTION data: ", data);
                const factExtractionPrompt = `Extract entities and facts from the given conversation.

<PREVIOUS MESSAGES>
${data.previousMessages}
</PREVIOUS MESSAGES>

<CURRENT MESSAGE>
${data.currentMessage}
</CURRENT MESSAGE>

<ENTITIES>
${JSON.stringify(data.entities)}
</ENTITIES>

Extract entities and relationships from the messages. Follow these rules:

1. For entities:
   - Create a separate entity for each distinct name/identity
   - Assign numeric IDs starting from 1
   - Use descriptive names exactly as mentioned
   - Use ALL_CAPS type (PERSON, OBJECT, CONCEPT, PLACE, ORGANIZATION)
   - Include a summary that captures key information
   - DO NOT combine different names into one entity

2. For relationships:
   - ALWAYS create a relationship when two names refer to the same person
   - Use ONLY these relationship types (exactly as written):
     * BIRTH_NAME_OF - Real name to pen name (e.g., Eric Blair -> George Orwell)
     * ALSO_KNOWN_AS - Alternate names (e.g., Samuel Clemens -> Mark Twain)
     * MEMBER_OF - Group membership
     * CREATOR_OF - Authorship
   - Include detailed descriptions
   - Use numeric IDs starting from 1
   - Set isTemporary: false for permanent facts (like birth names)
   - Set isTemporary: true only for conversation-specific relationships

3. Required Output Format:
{
    "entities": [
        {
            "id": 1,
            "name": "George Orwell",
            "type": "PERSON",
            "summary": "British author known by this pen name"
        },
        {
            "id": 2,
            "name": "Eric Blair",
            "type": "PERSON",
            "summary": "Birth name of the author known as George Orwell"
        }
    ],
    "relationships": [
        {
            "id": 1,
            "sourceId": 2,
            "targetId": 1,
            "type": "BIRTH_NAME_OF",
            "description": "Eric Blair is the birth name of the author known as George Orwell",
            "isTemporary": false
        }
    ]
}

IMPORTANT:
1. Use ONLY the relationship types listed above (BIRTH_NAME_OF, ALSO_KNOWN_AS, etc.)
2. Make sure JSON is complete with all closing braces
3. Do not include any explanatory text outside the JSON
4. Return ONLY the JSON object, nothing else`;
                
                const factExtractionResult = await this.client.chat.completions.create({
                    model: this.config.model,
                    temperature: 0.1,
                    max_tokens: this.config.maxTokens,
                    messages: [
                        { role: "system", content: "You are a fact extraction system that extracts entities and relationships from text. Only output complete, valid JSON." },
                        { role: "user", content: factExtractionPrompt }
                    ]
                });

                try {
                    const content = factExtractionResult.choices[0].message.content;
                    if (!content) {
                        throw new Error("No content in response");
                    }
                    console.log("\nRaw LLM Response:\n", content);
                    
                    let jsonStr = ''; // Declare outside try block
                    
                    // Try to find JSON in various formats:
                    // 1. First try to extract JSON between ```json and ```
                    jsonStr = content.match(/```json\s*([\s\S]*?)\s*```/)?.[1]?.trim() || '';
                    
                    // 2. If not found, try between ``` and ```
                    if (!jsonStr) {
                        jsonStr = content.match(/```\s*([\s\S]*?)\s*```/)?.[1]?.trim() || '';
                    }
                    
                    // 3. If still not found, try to find JSON-like structure in the content
                    if (!jsonStr) {
                        jsonStr = content.match(/\{[\s\S]*\}/)?.[0]?.trim() || '';
                    }
                    
                    // 4. If still nothing found, use the whole content
                    if (!jsonStr) {
                        jsonStr = content.trim();
                    }
                    
                    // Verify JSON has matching braces/brackets
                    if (!this.hasMatchingBraces(jsonStr)) {
                        throw new Error("JSON has unmatched braces or brackets");
                    }

                    try {
                        // Parse and validate the structure
                        const result = JSON.parse(jsonStr);
                        
                        // Validate the structure
                        const validatedData = FactExtractionSchema.parse(result);
                        
                        // Normalize relationship types
                        validatedData.relationships = validatedData.relationships.map(rel => ({
                            ...rel,
                            type: this.normalizeRelationType(rel.type)
                        }));
                        
                        return validatedData;
                    } catch (error) {
                        // Log error details before returning empty result
                        console.error("Failed to parse fact extraction result:", {
                            error: error instanceof Error ? error.message : String(error),
                            stack: error instanceof Error ? error.stack : undefined,
                            jsonString: jsonStr,
                            task: GraphTask.FACT_EXTRACTION
                        });
                        
                        return {
                            entities: [],
                            relationships: []
                        };
                    }
                } catch (error) {
                    console.error("Failed to parse fact extraction result:", error);
                    return {
                        entities: [],
                        relationships: []
                    };
                }

            case GraphTask.RESOLVE_FACTS:
                console.log("RESOLVE_FACTS data: ", data);
                const resolveFactsPrompt = `Determine if the new edge represents any existing edges.

<EXISTING EDGES>
${JSON.stringify(data.existing_edges, null, 2)}
</EXISTING EDGES>

<NEW EDGE>
${JSON.stringify(data.new_edge, null, 2)}
</NEW EDGE>

Compare the new edge with existing edges. If the new edge represents the same factual information as any existing edge:
1. Set is_duplicate to true
2. Include the uuid of the matching edge
3. Facts do not need to be identical, just express the same information

Return a JSON object with:
{
    "is_duplicate": boolean,
    "uuid": string (only if is_duplicate is true)
}`;

                const resolveFactsResult = await this.client.chat.completions.create({
                    model: this.config.model,
                    temperature: 0.1,
                    max_tokens: this.config.maxTokens,
                    messages: [
                        { role: "system", content: "You are a fact resolution system that determines if facts are duplicates. Only output valid JSON." },
                        { role: "user", content: resolveFactsPrompt }
                    ]
                });

                try {
                    const content = resolveFactsResult.choices[0].message.content;
                    if (!content) {
                        throw new Error("No content in response");
                    }
                    console.log("\nRaw LLM Response:\n", content);
                    
                    let jsonStr = ''; // Declare outside try block
                    
                    // Try to find JSON in various formats:
                    // 1. First try to extract JSON between ```json and ```
                    jsonStr = content.match(/```json\s*([\s\S]*?)\s*```/)?.[1]?.trim() || '';
                    
                    // 2. If not found, try between ``` and ```
                    if (!jsonStr) {
                        jsonStr = content.match(/```\s*([\s\S]*?)\s*```/)?.[1]?.trim() || '';
                    }
                    
                    // 3. If still not found, try to find JSON-like structure in the content
                    if (!jsonStr) {
                        jsonStr = content.match(/\{[\s\S]*\}/)?.[0]?.trim() || '';
                    }
                    
                    // 4. If still nothing found, use the whole content
                    if (!jsonStr) {
                        jsonStr = content.trim();
                    }
                    
                    // Verify JSON has matching braces/brackets
                    if (!this.hasMatchingBraces(jsonStr)) {
                        throw new Error("JSON has unmatched braces or brackets");
                    }

                    // Parse and validate the structure
                    const result = JSON.parse(jsonStr);
                    
                    // Ensure the result has the expected structure
                    if (!result.is_duplicate || typeof result.is_duplicate !== 'boolean') {
                        result.is_duplicate = false;
                    }
                    if (!result.uuid || typeof result.uuid !== 'string') {
                        result.uuid = null;
                    }
                    
                    return result;
                } catch (error) {
                    console.error("Failed to parse resolve facts result:", error);
                    return {
                        is_duplicate: false,
                        uuid: null
                    };
                }

            case GraphTask.EXTRACT_TEMPORAL:
                return await this.extractTemporal(data);

            case GraphTask.DEDUPE_NODES:
                return await this.deduplicateEntities(data.nodes);

            default:
                throw new Error(`Task ${task} not supported`);
        }
    }

    private logDebug(task: string, prompt: string, response: string | null = null) {
        if (!response) {
            // Before LLM call
            console.log(`\n=== ${task.toUpperCase()} - SENDING REQUEST ===\n`);
            console.log(`Prompt:\n${prompt}`);
        } else {
            // After LLM call
            console.log(`\n=== ${task.toUpperCase()} - RECEIVED RESPONSE ===\n`);
            console.log(`Response:\n${response}`);
        }
    }

    async processWithLLM(task: string, data: { prompt: string }): Promise<{ content: string }> {
        // Log the prompt before sending to LLM
        this.logDebug(task, data.prompt);

        const llmResult = await this.client.chat.completions.create({
            model: this.config.model,
            temperature: 0.1,
            max_tokens: this.config.maxTokens,
            messages: [
                { role: "system", content: `You are a ${task} system. Only output valid JSON.` },
                { role: "user", content: data.prompt }
            ]
        });

        const content = llmResult.choices[0].message.content;
        if (!content) {
            throw new Error("No content in response");
        }

        // Log the raw response
        this.logDebug(task, data.prompt, content);

        return { content };
    }

    async deduplicateEntities(nodes: Array<IGraphNode>): Promise<{ 
        entities: Array<{ id: string; name: string; type: string; summary: string; confidence?: number }>;
        mappings: Array<{ source_ids: string[]; target_id: string; confidence: number }>;
    }> {
        try {
            // Build the prompt with node information
            const data = {
                nodes,
                prompt: this.buildDedupeNodesPrompt(nodes)
            };

            // Get response from LLM with retries
            let attempts = 0;
            const maxAttempts = 3;
            let response: { content: string } | null = null;

            while (attempts < maxAttempts) {
                try {
                    response = await this.processWithLLM(GraphTask.DEDUPE_NODES, data);
                    break;
                } catch (error) {
                    attempts++;
                    if (attempts === maxAttempts) throw error;
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
                }
            }

            if (!response || !response.content) {
                throw new Error("No content in LLM response");
            }

            let jsonStr = ''; // Declare outside try block

            // Extract JSON from response
            if (response.content.includes('```json')) {
                jsonStr = response.content.split('```json')[1].split('```')[0].trim();
            } else {
                jsonStr = response.content.trim();
            }

            // Verify JSON has matching braces/brackets
            if (!this.hasMatchingBraces(jsonStr)) {
                console.error("Invalid JSON response:", jsonStr);
                throw new Error("JSON has unmatched braces or brackets");
            }

            // Parse and validate the response
            const result = JSON.parse(jsonStr);
            
            // Validate with Zod schema
            const validatedResult = DeduplicationResultSchema.parse(result);

            // Additional validation and filtering
            validatedResult.entities = validatedResult.entities.filter((entity) => {
                // Ensure entity type is valid
                const validTypes = ['PERSON', 'ORGANIZATION', 'PLACE', 'CONCEPT', 'OBJECT'];
                if (!validTypes.includes(entity.type)) {
                    console.warn(`Invalid entity type: ${entity.type} for entity:`, entity);
                    return false;
                }
                return true;
            });

            // Filter out low confidence mappings
            validatedResult.mappings = validatedResult.mappings.filter((mapping) => {
                if (mapping.confidence < 0.6) {
                    console.warn("Low confidence mapping filtered out:", mapping);
                    return false;
                }
                return true;
            });

            return validatedResult;
        } catch (error) {
            console.error("Error in deduplicateEntities:", error);
            // Return empty result on error to allow graceful degradation
            return {
                entities: [],
                mappings: []
            };
        }
    }

    private buildDedupeNodesPrompt(nodes: Array<IGraphNode>): string {
        const prompt = `
Given a list of nodes representing entities from a conversation, identify and merge nodes that refer to the same entity.
For each node, consider:
1. The entity name and type
2. The context in which it appears
3. Any aliases or alternative names that might be used
4. The confidence level of the match (0.0 to 1.0)

Important Rules:
1. Only merge nodes if you are confident they refer to the same entity
2. Assign a confidence score to each mapping:
   - 1.0: Exact match (e.g., identical names)
   - 0.8-0.9: Very likely the same (e.g., "George Orwell" and "Eric Blair")
   - 0.6-0.7: Probably the same with some uncertainty
   - < 0.6: Don't merge, keep as separate entities
3. Preserve the most informative name as the canonical name
4. Include detailed summaries that capture key information from all merged nodes

Input nodes:
${JSON.stringify(nodes, null, 2)}

Return format:
{
  "entities": [
    {
      "id": "unique_id",
      "name": "canonical_name",
      "type": "entity_type",
      "summary": "comprehensive description",
      "confidence": 0.95 // Optional overall confidence score
    }
  ],
  "mappings": [
    {
      "source_ids": ["input_node_id1", "input_node_id2"],
      "target_id": "unique_id",
      "confidence": 0.9 // Required confidence score for this mapping
    }
  ]
}`;

        return prompt;
    }

    private isValidISODate(dateStr: string): boolean {
        const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/;
        if (!isoDateRegex.test(dateStr)) return false;
        
        const date = new Date(dateStr);
        return date instanceof Date && !isNaN(date.getTime());
    }

    private hasMatchingBraces(str: string): boolean {
        const stack: string[] = [];
        const openBraces = "{[";
        const closeBraces = "}]";
        const pairs: { [key: string]: string } = { "}": "{", "]": "[" };

        for (const char of str) {
            if (openBraces.includes(char)) {
                stack.push(char);
            } else if (closeBraces.includes(char)) {
                if (stack.length === 0) return false;
                if (stack.pop() !== pairs[char]) return false;
            }
        }

        return stack.length === 0;
    }

    private normalizeRelationType(type: string): string {
        // Convert to uppercase and replace spaces with underscores
        return type.toUpperCase().replace(/\s+/g, '_');
    }

    public generateEntityId(name: string, entityType: string): string {
        const uniqueString = `${name.toLowerCase().trim()}|${entityType.toLowerCase()}`;
        return crypto.createHash('md5').update(uniqueString).digest('hex');
    }

    private async extractTemporal(data: { 
        entities: Array<{ id: string; name: string; type: string; summary: string }>;
        relationships: Array<Relationship>;
        conversation: Array<{ timestamp: string }>;
    }): Promise<{
        entities: Array<{ id: string; name: string; type: string; summary: string }>;
        relationships: Array<Relationship & { valid_at: string; invalid_at: string | null; confidence?: number }>;
    }> {
        const prompt = `Add temporal information to the given entities and relationships.
Use the conversation timestamps to determine valid_at and invalid_at times.

Input:
${JSON.stringify(data, null, 2)}

Rules:
1. Keep all existing relationship types EXACTLY as they are (e.g., BIRTH_NAME_OF, ALSO_KNOWN_AS)
2. Add temporal metadata with high precision:
   - valid_at: When the relationship became valid
     * For historical facts (e.g., birth names), use the actual historical date if mentioned
     * For conversation facts, use the timestamp of first mention
     * Format: ISO 8601 (YYYY-MM-DDTHH:mm:ssZ)
   - invalid_at: When the relationship became invalid
     * null for permanent facts (e.g., birth names)
     * Use conversation timestamp for temporary relationships
     * Format: ISO 8601 or null
   - confidence: Confidence score for the temporal information (0.0 to 1.0)
3. DO NOT change relationship types or directions
4. Validate all dates are in proper ISO 8601 format
5. Return complete JSON with all fields
6. IMPORTANT: Include all required fields:
   - id: Numeric ID for the relationship
   - isTemporary: Boolean indicating if this is a temporary relationship

Example Output:
{
    "entities": [
        {
            "id": 1,
            "name": "George Orwell",
            "type": "PERSON",
            "summary": "British author known by this pen name"
        }
    ],
    "relationships": [
        {
            "id": 1,
            "sourceId": 2,
            "targetId": 1,
            "type": "BIRTH_NAME_OF",
            "description": "Eric Blair is the birth name of the author known as George Orwell",
            "isTemporary": false,
            "valid_at": "1903-06-25T00:00:00Z",
            "invalid_at": null,
            "confidence": 1.0
        },
        {
            "id": 2,
            "sourceId": 3,
            "targetId": 1,
            "type": "CREATOR_OF",
            "description": "George Orwell wrote 1984",
            "isTemporary": false,
            "valid_at": "1949-06-08T00:00:00Z",
            "invalid_at": null,
            "confidence": 1.0
        }
    ]
}`;

        try {
            // Get response from LLM with retries
            let attempts = 0;
            const maxAttempts = 3;
            let result: any;

            while (attempts < maxAttempts) {
                try {
                    result = await this.processWithLLM('extract_temporal', { prompt });
                    break;
                } catch (error) {
                    attempts++;
                    if (attempts === maxAttempts) throw error;
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
                }
            }

            // Validate with Zod schema
            const validatedResult = TemporalResultSchema.parse(result);

            // Additional validation
            validatedResult.relationships = validatedResult.relationships.filter((rel) => {
                try {
                    // Validate ISO 8601 dates
                    if (!this.isValidISODate(rel.valid_at)) {
                        console.warn(`Invalid valid_at date format: ${rel.valid_at}`);
                        return false;
                    }
                    if (rel.invalid_at && !this.isValidISODate(rel.invalid_at)) {
                        console.warn(`Invalid invalid_at date format: ${rel.invalid_at}`);
                        return false;
                    }

                    // Validate temporal logic
                    if (rel.invalid_at && new Date(rel.valid_at) >= new Date(rel.invalid_at)) {
                        console.warn(`Invalid temporal order: valid_at (${rel.valid_at}) >= invalid_at (${rel.invalid_at})`);
                        return false;
                    }

                    return true;
                } catch (error) {
                    console.warn("Error validating relationship:", error);
                    return false;
                }
            });

            return validatedResult;
        } catch (error) {
            console.error("Error in extractTemporal:", error);
            // Return fallback with all required fields
            return {
                entities: data.entities,
                relationships: data.relationships.map((rel, index) => ({
                    ...rel,
                    id: rel.id || index + 1,
                    isTemporary: rel.isTemporary || false,
                    valid_at: new Date().toISOString(),
                    invalid_at: null,
                    confidence: 0.5
                }))
            };
        }
    }
}
