import { z } from 'zod';
import { GraphTask, LLMConfig } from '../../types';
import { OpenAI } from 'openai';

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
   - Connect distinct entities
   - Use ALL_CAPS relationship types
   - Include detailed descriptions
   - Use numeric IDs starting from 1
   - Consider temporal aspects
   - DO NOT create self-referential relationships

Return a complete, well-formed JSON object with:
{
    "entities": [{"id": number, "name": string, "type": string, "summary": string}],
    "relationships": [{"id": number, "sourceId": number, "targetId": number, "type": string, "description": string, "isTemporary": boolean}]
}

Make sure to include all closing braces and brackets.`;
                
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
                    
                    // Clean the response:
                    // 1. Remove <think>...</think> sections
                    // 2. Extract JSON between ```json and ```
                    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
                    if (!jsonMatch) {
                        throw new Error("No JSON block found in response");
                    }
                    
                    // Verify JSON has matching braces/brackets
                    const jsonStr = jsonMatch[1].trim();
                    if (!this.hasMatchingBraces(jsonStr)) {
                        throw new Error("JSON has unmatched braces or brackets");
                    }
                    
                    return JSON.parse(jsonStr);
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
                    
                    // Clean the response:
                    // 1. Remove <think>...</think> sections
                    // 2. Extract JSON between ```json and ```
                    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
                    if (!jsonMatch) {
                        throw new Error("No JSON block found in response");
                    }
                    
                    return JSON.parse(jsonMatch[1]);
                } catch (error) {
                    console.error("Failed to parse resolve facts result:", error);
                    return {
                        is_duplicate: false,
                        uuid: null
                    };
                }

            case GraphTask.EXTRACT_TEMPORAL:
                console.log("\nRaw LLM Response:\n", data);
                const temporalExtractionPrompt = `Extract temporal information from the given conversation.

<PREVIOUS MESSAGES>
${data.previousMessages}
</PREVIOUS MESSAGES>

<CURRENT MESSAGE>
${data.currentMessage}
</CURRENT MESSAGE>

<ENTITIES>
${JSON.stringify(data.entities)}
</ENTITIES>

Add temporal information to the entities and relationships. Follow these rules:

1. For entities:
   - Keep existing IDs, names, and types
   - Use ALL_CAPS for types
   - Temporal info comes from when they're mentioned

2. For relationships:
   - Keep relationship types in ALL_CAPS
   - Use EXACTLY the same sourceId/targetId as input
   - Keep relationship types consistent with previous steps
   - Add valid_at based on when relationship is mentioned
   - Add invalid_at only if relationship has a clear end date
   - If relationship is permanent (like birth names), leave invalid_at as null

Return a JSON object with:
{
    "entities": [{"id": number, "name": string, "type": string}],
    "relationships": [{"sourceId": number, "targetId": number, "type": string, "name": string, "description": string, "valid_at": string, "invalid_at": string | null}]
}

Example relationship type mapping:
- BIRTH_NAME_OF -> BIRTH_NAME_OF
- REAL_NAME_OF -> REAL_NAME_OF
- Alias -> ALIAS_OF
- "also known as" -> ALIAS_OF`;

                const temporalExtractionResult = await this.client.chat.completions.create({
                    model: this.config.model,
                    temperature: 0.1,
                    max_tokens: this.config.maxTokens,
                    messages: [
                        { role: "system", content: "You are a temporal information extraction system. Only output valid JSON." },
                        { role: "user", content: temporalExtractionPrompt }
                    ]
                });

                try {
                    const content = temporalExtractionResult.choices[0].message.content;
                    if (!content) {
                        throw new Error("No content in response");
                    }
                    console.log("\nRaw LLM Response:\n", content);
                    
                    // Extract JSON between ```json and ```
                    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
                    if (!jsonMatch) {
                        throw new Error("No JSON block found in response");
                    }
                    
                    // Verify JSON has matching braces/brackets
                    const jsonStr = jsonMatch[1].trim();
                    if (!this.hasMatchingBraces(jsonStr)) {
                        throw new Error("JSON has unmatched braces or brackets");
                    }
                    
                    const result = JSON.parse(jsonStr);
                    
                    // Normalize relationship types to ALL_CAPS
                    if (result.relationships) {
                        result.relationships = result.relationships.map((rel: any) => ({
                            ...rel,
                            type: this.normalizeRelationType(rel.type)
                        }));
                    }
                    
                    return result;
                } catch (error) {
                    console.error("Failed to parse temporal extraction result:", error);
                    return {
                        entities: [],
                        relationships: []
                    };
                }

            default:
                throw new Error(`Task ${task} not supported`);
        }
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
