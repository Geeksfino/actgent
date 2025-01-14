import { ConceptNode, ConceptRelation, RelationType } from '../types';
import { OpenAI } from 'openai';
import { logger } from '../../../../Logger';

interface ExtractedConcepts {
    concepts: ConceptNode[];
    relations: ConceptRelation[];
}

interface ConceptExtractionResult {
    concept: string;
    type: string;
    properties: Record<string, any>;
    confidence: number;
}

interface RelationExtractionResult {
    source: string;
    target: string;
    type: RelationType;
    confidence: number;
}

interface NLPResponse {
    concepts: ConceptExtractionResult[];
    relations: RelationExtractionResult[];
}

/**
 * Service for natural language processing operations
 */
export class NLPService {
    private openai: OpenAI;
    private model: string;
    private systemPrompt: string;

    constructor(apiKey: string, model: string = 'gpt-4') {
        this.openai = new OpenAI({ apiKey });
        this.model = model;
        this.systemPrompt = `You are a concept extraction system. Analyze the text and extract:
1. Key concepts with their types and properties
2. Relationships between concepts
3. Confidence scores for each extraction

Format your response as JSON with:
{
    "concepts": [
        {
            "concept": string,
            "type": string,
            "properties": object,
            "confidence": number
        }
    ],
    "relations": [
        {
            "source": string,
            "target": string,
            "type": string (one of: IS_A, HAS_A, PART_OF, RELATED_TO, SIMILAR_TO, OPPOSITE_OF, CAUSES, PRECEDED_BY, FOLLOWED_BY, USED_FOR),
            "confidence": number
        }
    ]
}`;
    }

    async extractConcepts(text: string): Promise<ExtractedConcepts> {
        logger.info('NLPService.extractConcepts called with text:', text);
        try {
            const response = await this.openai.chat.completions.create({
                model: this.model,
                messages: [
                    { role: 'system', content: this.systemPrompt },
                    { role: 'user', content: text }
                ],
                temperature: 0.3,
                response_format: { type: 'json_object' }
            });

            const content = response.choices[0].message.content;
            if (!content) {
                return { concepts: [], relations: [] };
            }

            const result = JSON.parse(content) as NLPResponse;
            return this.convertToExtractedConcepts(result);
        } catch (error) {
            logger.error('Error extracting concepts:', error);
            return { concepts: [], relations: [] };
        }
    }

    async calculateSimilarity(text1: string | null, text2: string | null): Promise<number> {
        if (!text1 || !text2) return 0;

        try {
            // Safely cast text1 and text2 since we've checked they're not null
            const safeText1 = text1 as string;
            const safeText2 = text2 as string;
            
            const prompt = `Compare these two concepts and rate their similarity on a scale of 0 to 1:
1. ${safeText1}
2. ${safeText2}

Consider semantic meaning, context, and potential relationships.
Return only the numerical score, nothing else.`;

            const response = await this.openai.chat.completions.create({
                model: this.model,
                messages: [
                    { role: 'system', content: 'You are a semantic similarity calculator.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.1
            });

            const content = response.choices[0].message.content;
            if (!content) return 0;

            const score = parseFloat(content);
            return isNaN(score) ? 0 : Math.max(0, Math.min(1, score));
        } catch (error) {
            logger.error('Error calculating similarity:', error);
            return 0;
        }
    }

    async classifyRelation(source: string | null, target: string | null): Promise<{ type: RelationType; confidence: number }> {
        if (!source || !target) {
            return { type: RelationType.RELATED_TO, confidence: 0.5 };
        }

        try {
            // Safely cast source and target since we've checked they're not null
            const safeSource = source as string;
            const safeTarget = target as string;
            
            const prompt = `What is the relationship between "${safeSource}" and "${safeTarget}"?
Choose from these types: IS_A, HAS_A, PART_OF, RELATED_TO, SIMILAR_TO, OPPOSITE_OF, CAUSES, PRECEDED_BY, FOLLOWED_BY, USED_FOR

Return as JSON:
{
    "type": "relationship_type",
    "confidence": confidence_score
}`;

            const response = await this.openai.chat.completions.create({
                model: this.model,
                messages: [
                    { role: 'system', content: 'You are a relationship classifier.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.3,
                response_format: { type: 'json_object' }
            });

            const content = response.choices[0].message.content;
            if (!content) {
                return { type: RelationType.RELATED_TO, confidence: 0.5 };
            }

            const result = JSON.parse(content);
            return {
                type: result.type as RelationType,
                confidence: result.confidence
            };
        } catch (error) {
            logger.error('Error classifying relation:', error);
            return { type: RelationType.RELATED_TO, confidence: 0.5 };
        }
    }

    private convertToExtractedConcepts(response: NLPResponse): ExtractedConcepts {
        const concepts: ConceptNode[] = response.concepts.map(concept => ({
            id: crypto.randomUUID(),
            name: concept.concept,
            label: concept.concept,
            type: concept.type,
            properties: new Map(Object.entries(concept.properties)),
            confidence: concept.confidence,
            lastVerified: new Date(),
            source: 'NLPService'
        }));

        const relations: ConceptRelation[] = response.relations.map(relation => ({
            id: crypto.randomUUID(),
            sourceId: concepts.find(c => c.label === relation.source)?.id || '',
            targetId: concepts.find(c => c.label === relation.target)?.id || '',
            type: relation.type,
            weight: 1.0,
            properties: new Map(),
            confidence: relation.confidence,
            lastUpdated: new Date(),
            source: 'NLPService'
        }));

        return { concepts, relations };
    }
}
