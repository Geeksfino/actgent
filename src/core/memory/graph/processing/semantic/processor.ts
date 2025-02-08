import { z } from 'zod';
import { GraphTask } from '../../types';

/**
 * Semantic graph processor for extracting entities and relationships from text
 */
export class SemanticGraphProcessor {

    /**
     * Process a task and return the result
     */
    async process(task: GraphTask, data: any): Promise<any> {
        switch (task) {
            case GraphTask.FACT_EXTRACTION:
                console.log("FACT_EXTRACTION data: ", data);
                // Adapt the edge prompt from graphiti/graphiti_core/prompts/extract_edges.py
                const evaluatePathsPrompt = `
                <PREVIOUS MESSAGES>
                {previousMessages}
                </PREVIOUS MESSAGES>
                
                <CURRENT MESSAGE>
                ${JSON.stringify(data.path)}
                </CURRENT MESSAGE>
                
                <ENTITIES>
                ${JSON.stringify(data.entities)}
                </ENTITIES>
                
                Extract entities and their relationships from the given text and context. Follow these guidelines:
                
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
                4. Consider temporal aspects of relationships when relevant
                5. Use numeric IDs starting from 1
                6. Consider relationships between current text and context entities (entity linking)
                
                Return a JSON object with:
                1. entities: Array of {id: number, name: string, type: string, summary: string}
                2. relationships: Array of {id: number, sourceId: number, targetId: number, type: string, description: string, isTemporary: boolean}
                `;               console.log("FACT_EXTRACTION prompt: ", evaluatePathsPrompt);
                return {
                    prompt: evaluatePathsPrompt,
                    functionSchema: z.object({ source_entity: z.string(), target_entity: z.string(), relation_type: z.string(), description: z.string() })
                };
            default:
                throw new Error(`Task ${task} not supported`);
        }
    }
}
