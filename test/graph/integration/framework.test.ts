import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InMemoryGraphStorage } from '../../../src/core/memory/graph/data/InMemoryGraphStorage';
import { MemoryGraph } from '../../../src/core/memory/graph/data/operations';
import { GraphLLMProcessor } from '../../../src/core/memory/graph/processing/llm/processor';
import * as fs from 'fs/promises';
import * as path from 'path';

// Types for our test data
interface TestConversationNode {
    id: string;
    timestamp: number;
    content: {
        text: string;
        entities: {
            type: string;
            value: string;
            metadata?: any;
        }[];
    };
}

class GraphFrameworkTest {
    private storage: InMemoryGraphStorage;
    public operations: MemoryGraph;
    private mockLLMProcessor: GraphLLMProcessor;
    
    constructor() {
        this.storage = new InMemoryGraphStorage();
        this.mockLLMProcessor = this.createMockLLMProcessor();
        this.operations = new MemoryGraph(this.storage, this.mockLLMProcessor);
    }

    private createMockLLMProcessor(): GraphLLMProcessor {
        return {
            process: vi.fn().mockImplementation(async (task, data) => {
                // Mock implementations for different tasks
                switch(task) {
                    case 'evaluate_paths':
                        return [{
                            path: data.path,
                            score: 0.8,
                            explanation: 'Mock path evaluation'
                        }];
                    case 'refine_communities':
                        return [{
                            nodes: data.nodes,
                            label: 'Mock Community',
                            confidence: 0.9
                        }];
                    default:
                        return null;
                }
            })
        } as unknown as GraphLLMProcessor;
    }

    async loadTestData() {
        const historyPath = path.join(__dirname, './convo.json');
        const conversationHistory = JSON.parse(await fs.readFile(historyPath, 'utf-8'));
        const testNodes = this.transformToTestNodes(conversationHistory);
        await this.populateGraph(testNodes);
    }

    private transformToTestNodes(conversationHistory: any[]): TestConversationNode[] {
        return conversationHistory.map((msg, index) => ({
            id: `conv_${index}`,
            timestamp: Date.now() + index * 1000,
            content: {
                text: typeof msg.content === 'string' ? 
                      msg.content : 
                      JSON.stringify(msg.content),
                entities: this.extractEntities(msg.content)
            }
        }));
    }

    private extractEntities(content: any): any[] {
        const entities = [];
        const text = typeof content === 'string' ? content : content.content;
        
        // Medical conditions
        const conditions = ['flu', 'fever', 'cough', 'pneumonia', 'bronchitis'];
        for (const condition of conditions) {
            if (text.toLowerCase().includes(condition)) {
                entities.push({
                    type: 'medical_condition',
                    value: condition
                });
            }
        }

        // Symptoms
        const symptoms = ['body aches', 'congestion', 'difficulty breathing'];
        for (const symptom of symptoms) {
            if (text.toLowerCase().includes(symptom)) {
                entities.push({
                    type: 'symptom',
                    value: symptom
                });
            }
        }

        // Treatments
        const treatments = ['rest', 'stay hydrated', 'pain relievers', 'ibuprofen', 'acetaminophen', 'decongestants'];
        for (const treatment of treatments) {
            if (text.toLowerCase().includes(treatment)) {
                entities.push({
                    type: 'treatment',
                    value: treatment
                });
            }
        }

        return entities;
    }

    private generateSafeEntityId(entity: { type: string, value?: string }): string {
        if (!entity.value) {
            return `entity_${entity.type}_unknown`;
        }
        // Create a safe ID by taking only the first few words of the value
        const safeValue = entity.value
            .split(' ')
            .slice(0, 3)
            .join('_')
            .replace(/[^a-zA-Z0-9_]/g, '')
            .substring(0, 20);
        return `entity_${entity.type}_${safeValue}`;
    }

    private async populateGraph(nodes: TestConversationNode[]) {
        for (const node of nodes) {
            await this.operations.addNode({
                id: node.id,
                type: 'episode',
                content: node.content.text,
                metadata: new Map(Object.entries({
                    timestamp: node.timestamp,
                    entities: node.content.entities
                })),
                createdAt: new Date()
            });

            // Add entity nodes and relationships
            for (const entity of node.content.entities) {
                const entityId = this.generateSafeEntityId(entity);
                await this.operations.addNode({
                    id: entityId,
                    type: 'entity',
                    content: entity.value,
                    metadata: new Map(Object.entries({
                        entityType: entity.type,
                        ...entity.metadata
                    })),
                    createdAt: new Date()
                });

                // Link episode to entity
                await this.operations.addEdge({
                    id: `${node.id}_${entityId}_mentions`,
                    sourceId: node.id,
                    targetId: entityId,
                    type: 'mentions',
                    content: 'mentions',
                    metadata: new Map(Object.entries({
                        timestamp: node.timestamp
                    })),
                    createdAt: new Date()
                });
            }
        }
    }
}

describe('Graph Framework Integration', () => {
    let testFramework: GraphFrameworkTest;

    beforeEach(async () => {
        testFramework = new GraphFrameworkTest();
        await testFramework.loadTestData();
    });

    describe('Entity Resolution', () => {
        it('should link related entities across conversations', async () => {
            // Get all nodes and edges
            const result = await testFramework.operations.getNodes({});
            
            // Verify that we have extracted medical conditions
            const conditions = result.filter(n => n.type === 'entity' && n.metadata.get('entityType') === 'medical_condition');
            expect(conditions.length).toBeGreaterThan(0);
            
            // Verify that conditions are linked to their mentions
            for (const condition of conditions) {
                const edges = await testFramework.operations.getEdges({ nodeIds: [condition.id], edgeTypes: ['mentions'] });
                const targetEdges = edges.filter(edge => edge.targetId === condition.id);
                expect(targetEdges.length).toBeGreaterThan(0);
            }
        });
    });

    describe('Temporal Processing', () => {
        it('should track entity evolution over time', async () => {
            const result = await testFramework.operations.getNodes({});
            
            // Get all mentions of medical conditions
            const conditionMentions = await testFramework.operations.getEdges({ edgeTypes: ['mentions'] });
            const conditionNodes = result.filter(n => n.type === 'entity' && n.metadata.get('entityType') === 'medical_condition');
            const conditionMentionsFiltered = conditionMentions.filter(e => conditionNodes.find(n => n.id === e.targetId));
            
            // Verify that mentions have timestamps
            for (const mention of conditionMentionsFiltered) {
                expect(mention.metadata.get('timestamp')).toBeDefined();
            }
            
            // Verify mentions are ordered chronologically
            const timestamps = conditionMentionsFiltered.map(m => m.metadata.get('timestamp'));
            const sortedTimestamps = [...timestamps].sort((a, b) => a - b);
            expect(timestamps).toEqual(sortedTimestamps);
        });
    });

    describe('Community Detection', () => {
        it('should identify related entity groups', async () => {
            const result = await testFramework.operations.getNodes({});
            
            // Get all entity types
            const entityTypes = new Set(
                result
                    .filter(n => n.type === 'entity')
                    .map(n => n.metadata.get('entityType'))
            );
            
            // Verify we have different types of medical entities
            expect(entityTypes.size).toBeGreaterThan(1);
            expect(entityTypes.has('medical_condition')).toBe(true);
            expect(entityTypes.has('symptom')).toBe(true);
            expect(entityTypes.has('treatment')).toBe(true);
            
            // Verify entities are connected to episodes
            const entityNodes = result.filter(n => n.type === 'entity');
            for (const entity of entityNodes) {
                const connections = await testFramework.operations.getEdges({ nodeIds: [entity.id] });
                expect(connections.length).toBeGreaterThan(0);
            }
        });
    });
});
