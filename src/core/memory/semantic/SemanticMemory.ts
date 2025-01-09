import { ISemanticMemory, IConceptGraph, ConceptNode, ConceptRelation, RelationType } from './types';
import { IMemoryUnit, MemoryType } from '../types';
import { ConceptGraph } from './ConceptGraph';
import { NLPService } from './nlp/NLPService';
import { WordEmbeddings } from './nlp/WordEmbeddings';
import crypto from 'crypto';
import { logger } from '../../Logger';

/**
 * Implementation of semantic memory using concept graph and NLP
 */
export class SemanticMemory implements ISemanticMemory {
    private conceptGraph: IConceptGraph;
    private nlpService: NLPService;
    private wordEmbeddings: WordEmbeddings;
    private consistencyThreshold: number;

    constructor(
        conceptGraph?: IConceptGraph, 
        nlpService?: NLPService,
        wordEmbeddings?: WordEmbeddings,
        consistencyThreshold: number = 0.7
    ) {
        this.conceptGraph = conceptGraph || new ConceptGraph();
        this.nlpService = nlpService || new NLPService(process.env.OPENAI_API_KEY || '');
        this.wordEmbeddings = wordEmbeddings || new WordEmbeddings();
        this.consistencyThreshold = consistencyThreshold;
    }

    async store(memory: IMemoryUnit): Promise<void> {
        try {
            // Extract concepts and relations using NLP
            const { concepts, relations } = await this.extractConcepts(memory);

            // Store concepts
            for (const concept of concepts) {
                const existingConcepts = await this.findConcepts(concept.label);
                if (existingConcepts.length > 0) {
                    // Check consistency with existing concepts
                    const mostSimilar = await this.findMostSimilarConcept(concept, existingConcepts);
                    if (mostSimilar && await this.checkConsistency(concept, mostSimilar)) {
                        // Merge with existing concept
                        await this.conceptGraph.merge(concept, mostSimilar);
                    } else {
                        // Store as new concept
                        await this.conceptGraph.addNode(concept);
                    }
                } else {
                    await this.conceptGraph.addNode(concept);
                }
            }

            // Store relations
            for (const relation of relations) {
                if (relation.sourceId && relation.targetId) {
                    await this.conceptGraph.addRelation(relation);
                }
            }
        } catch (error) {
            logger.error('Error storing memory:', error);
            throw error;
        }
    }

    async retrieve(query: string): Promise<IMemoryUnit[]> {
        try {
            // Find concepts using both exact match and semantic similarity
            const concepts = await this.conceptGraph.findNodes(query);
            const memories: IMemoryUnit[] = [];

            for (const concept of concepts) {
                // Convert concept to memory unit
                const memory: IMemoryUnit = {
                    id: crypto.randomUUID(),
                    content: {
                        text: concept.label,
                        type: concept.type,
                        properties: Object.fromEntries(concept.properties)
                    },
                    metadata: new Map([
                        ['type', MemoryType.SEMANTIC],
                        ['confidence', concept.confidence.toString()],
                        ['source', concept.source.join(',')]
                    ]),
                    timestamp: concept.lastUpdated,
                    accessCount: 0,
                    lastAccessed: new Date()
                };
                memories.push(memory);
            }

            return memories;
        } catch (error) {
            logger.error('Error retrieving memories:', error);
            return [];
        }
    }

    async update(memory: IMemoryUnit): Promise<void> {
        await this.store(memory);
    }

    async delete(id: string): Promise<void> {
        await this.conceptGraph.deleteNode(id);
    }

    async findConcepts(query: string): Promise<ConceptNode[]> {
        return this.conceptGraph.findNodes(query);
    }

    async findRelations(conceptId: string): Promise<ConceptRelation[]> {
        return this.conceptGraph.getRelations(conceptId);
    }

    async mergeConcepts(sourceId: string, targetId: string): Promise<void> {
        const source = await this.conceptGraph.getNode(sourceId);
        const target = await this.conceptGraph.getNode(targetId);

        if (!source || !target) {
            throw new Error('Source or target concept not found');
        }

        await this.conceptGraph.merge(source, target);
    }

    getConceptGraph(): IConceptGraph {
        return this.conceptGraph;
    }

    private async extractConcepts(memory: IMemoryUnit): Promise<{ concepts: ConceptNode[]; relations: ConceptRelation[] }> {
        const text = typeof memory.content === 'string' ? 
            memory.content : 
            memory.content.text || '';

        try {
            // Use NLP service to extract concepts and relations
            const extracted = await this.nlpService.extractConcepts(text);

            // Add memory source to all concepts and relations
            extracted.concepts.forEach(concept => concept.source.push(memory.id));
            extracted.relations.forEach(relation => relation.source.push(memory.id));

            return extracted;
        } catch (error) {
            logger.error('Error in concept extraction:', error);
            
            // Fallback to simple word-based extraction
            const concepts: ConceptNode[] = text
                .split(/\W+/)
                .filter((word: string) => word.length > 2)
                .map((word: string) => ({
                    id: crypto.randomUUID(),
                    label: word,
                    type: 'concept',
                    properties: new Map(),
                    confidence: 0.5,
                    lastUpdated: new Date(),
                    source: [memory.id]
                }));

            return { concepts, relations: [] };
        }
    }

    private async findMostSimilarConcept(concept: ConceptNode, candidates: ConceptNode[]): Promise<ConceptNode | null> {
        let mostSimilar: ConceptNode | null = null;
        let highestSimilarity = 0;

        for (const candidate of candidates) {
            // Try word embeddings first
            let similarity = await this.wordEmbeddings.calculateSimilarity(concept.label, candidate.label);
            
            // If no embedding found, use NLP service as fallback
            if (similarity === 0) {
                similarity = await this.nlpService.calculateSimilarity(concept.label, candidate.label);
            }

            if (similarity > highestSimilarity) {
                highestSimilarity = similarity;
                mostSimilar = candidate;
            }
        }

        return mostSimilar;
    }

    private async checkConsistency(concept1: ConceptNode, concept2: ConceptNode): Promise<boolean> {
        // Check type consistency
        if (concept1.type !== concept2.type) {
            return false;
        }

        // Calculate semantic similarity
        const similarity = await this.calculateConceptSimilarity(concept1, concept2);
        if (similarity < this.consistencyThreshold) {
            return false;
        }

        // Check property consistency
        const properties1 = Array.from(concept1.properties.entries());
        const properties2 = Array.from(concept2.properties.entries());
        
        for (const [key, value1] of properties1) {
            const value2 = concept2.properties.get(key);
            if (value2 !== undefined && value1 !== value2) {
                // If same property has different values, check if they're semantically similar
                const propSimilarity = await this.nlpService.calculateSimilarity(
                    value1.toString(),
                    value2.toString()
                );
                if (propSimilarity < this.consistencyThreshold) {
                    return false;
                }
            }
        }

        return true;
    }

    private async calculateConceptSimilarity(concept1: ConceptNode, concept2: ConceptNode): Promise<number> {
        // Try word embeddings first
        let similarity = await this.wordEmbeddings.calculateSimilarity(concept1.label, concept2.label);
        
        // If no embedding found, use NLP service
        if (similarity === 0) {
            similarity = await this.nlpService.calculateSimilarity(concept1.label, concept2.label);
        }

        return similarity;
    }
}
