import { z } from 'zod';
import { GraphTask, LLMConfig } from '../../types';
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
                    
                    // Try to find JSON in various formats:
                    // 1. First try to extract JSON between ```json and ```
                    let jsonStr = content.match(/```json\s*([\s\S]*?)\s*```/)?.[1]?.trim();
                    
                    // 2. If not found, try between ``` and ```
                    if (!jsonStr) {
                        jsonStr = content.match(/```\s*([\s\S]*?)\s*```/)?.[1]?.trim();
                    }
                    
                    // 3. If still not found, try to find JSON-like structure in the content
                    if (!jsonStr) {
                        jsonStr = content.match(/\{[\s\S]*\}/)?.[0]?.trim();
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
                    if (!result.entities || !Array.isArray(result.entities)) {
                        result.entities = [];
                    }
                    if (!result.relationships || !Array.isArray(result.relationships)) {
                        result.relationships = [];
                    }
                    
                    // Normalize relationship types
                    result.relationships = result.relationships.map((rel: Relationship) => ({
                        ...rel,
                        type: this.normalizeRelationType(rel.type)
                    }));
                    
                    return result;
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
                    
                    // Try to find JSON in various formats:
                    // 1. First try to extract JSON between ```json and ```
                    let jsonStr = content.match(/```json\s*([\s\S]*?)\s*```/)?.[1]?.trim();
                    
                    // 2. If not found, try between ``` and ```
                    if (!jsonStr) {
                        jsonStr = content.match(/```\s*([\s\S]*?)\s*```/)?.[1]?.trim();
                    }
                    
                    // 3. If still not found, try to find JSON-like structure in the content
                    if (!jsonStr) {
                        jsonStr = content.match(/\{[\s\S]*\}/)?.[0]?.trim();
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

    async deduplicateEntities(nodes: Array<any>): Promise<{ entities: Array<any>, mappings: Array<any> }> {
        const data = {
            nodes,
            prompt: this.buildDedupeNodesPrompt(nodes)
        };

        const result = await this.processWithLLM(GraphTask.DEDUPE_NODES, data);
        return result;
    }

    public generateEntityId(name: string, entityType: string): string {
        const uniqueString = `${name.toLowerCase().trim()}|${entityType.toLowerCase()}`;
        return crypto.createHash('md5').update(uniqueString).digest('hex');
    }

    private async extractTemporal(data: { 
        entities: any[],
        relationships: any[],
        conversation: { timestamp: string }[]
    }): Promise<any> {
        const prompt = `Add temporal information to the given entities and relationships.
Use the conversation timestamps to determine valid_at and invalid_at times.

Input:
${JSON.stringify(data, null, 2)}

Rules:
1. Keep all existing relationship types EXACTLY as they are (e.g., BIRTH_NAME_OF, ALSO_KNOWN_AS)
2. Add temporal metadata:
   - valid_at: When the relationship became valid (use conversation timestamp for new facts)
   - invalid_at: When the relationship became invalid (null for permanent facts)
3. DO NOT change relationship types or directions
4. Return complete JSON with all fields

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
            "sourceId": 2,
            "targetId": 1,
            "type": "BIRTH_NAME_OF",
            "description": "Eric Blair is the birth name of the author known as George Orwell",
            "valid_at": "2024-01-01T00:00:00Z",
            "invalid_at": null
        }
    ]
}`;

        return await this.processWithLLM('extract_temporal', { prompt });
    }

    private async processWithLLM(task: string, data: any): Promise<any> {
        const llmResult = await this.client.chat.completions.create({
            model: this.config.model,
            temperature: 0.1,
            max_tokens: this.config.maxTokens,
            messages: [
                { role: "system", content: `You are a ${task} system. Only output valid JSON.` },
                { role: "user", content: data.prompt }
            ]
        });

        try {
            const content = llmResult.choices[0].message.content;
            if (!content) {
                throw new Error("No content in response");
            }
            console.log("\nRaw LLM Response:\n", content);
            
            // Try to find JSON in various formats:
            // 1. First try to extract JSON between ```json and ```
            let jsonStr = content.match(/```json\s*([\s\S]*?)\s*```/)?.[1]?.trim();
            
            // 2. If not found, try between ``` and ```
            if (!jsonStr) {
                jsonStr = content.match(/```\s*([\s\S]*?)\s*```/)?.[1]?.trim();
            }
            
            // 3. If still not found, try to find JSON-like structure in the content
            if (!jsonStr) {
                jsonStr = content.match(/\{[\s\S]*\}/)?.[0]?.trim();
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
            const parsedResult = JSON.parse(jsonStr);
            
            // Ensure the result has the expected structure
            if (!parsedResult.entities || !Array.isArray(parsedResult.entities)) {
                parsedResult.entities = [];
            }
            if (!parsedResult.relationships || !Array.isArray(parsedResult.relationships)) {
                parsedResult.relationships = [];
            }
            
            return parsedResult;
        } catch (error) {
            console.error("Failed to parse result:", error);
            return {
                entities: [],
                relationships: []
            };
        }
    }

    private buildDedupeNodesPrompt(nodes: Array<any>): string {
        const prompt = `
Given a list of nodes representing entities from a conversation, identify and merge nodes that refer to the same entity.
For each node, consider:
1. The entity name and type
2. The context in which it appears
3. Any aliases or alternative names that might be used

Return a JSON object with:
1. A list of unique entities
2. A mapping of which input nodes should be merged into which unique entities

Input nodes:
${JSON.stringify(nodes, null, 2)}

Return format:
{
  "entities": [
    {
      "id": "unique_id",
      "name": "canonical_name",
      "type": "entity_type",
      "summary": "brief description"
    }
  ],
  "mappings": [
    {
      "source_ids": ["input_node_id1", "input_node_id2"],
      "target_id": "unique_id"
    }
  ]
}

Example:
If input nodes contain multiple mentions of "George Orwell" and "Eric Blair", they should be merged into a single entity
with appropriate mappings to show they refer to the same person.`;

        return prompt;
    }

    private hasMatchingBraces(str: string): boolean {
        const stack: string[] = [];
        const openBraces = "{[";
        const closeBraces = "}]";
        const pairs: {[key: string]: string} = {"}": "{", "]": "["};
        
        for (const char of str) {
            if (openBraces.includes(char)) {
                stack.push(char);
            } else if (closeBraces.includes(char)) {
                if (stack.length === 0) return false;
                const lastOpen = stack.pop()!;
                if (lastOpen !== pairs[char]) return false;
            }
        }
        return stack.length === 0;
    }

    private normalizeRelationType(type: string): string {
        // Convert to uppercase and replace spaces with underscores
        const normalized = type.toUpperCase().replace(/\s+/g, '_');
        
        // Map common variations to standard types
        const typeMap: {[key: string]: string} = {
            'ALIAS': 'ALIAS_OF',
            'ALSO_KNOWN_AS': 'ALIAS_OF',
            'BIRTH_NAME': 'BIRTH_NAME_OF',
            'REAL_NAME': 'REAL_NAME_OF'
        };
        
        return typeMap[normalized] || normalized;
    }
}
