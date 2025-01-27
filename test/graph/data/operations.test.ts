import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GraphOperations } from '../../../src/core/memory/graph/data/operations';
import { InMemoryGraphStorage } from '../../../src/core/memory/graph/data/InMemoryGraphStorage';
import { GraphLLMProcessor } from '../../../src/core/memory/graph/processing/llm/processor';
import { GraphFilter, IGraphNode, IGraphEdge, GraphMemoryType } from '../../../src/core/memory/graph/data/types';
import { MockDataGenerator } from '../utils/mock_data';

// Mock LLM processor
let mockLLMProcessor: GraphLLMProcessor;

describe('GraphOperations', () => {
    let storage: InMemoryGraphStorage;
    let operations: GraphOperations;

    beforeEach(() => {
        storage = new InMemoryGraphStorage();
        mockLLMProcessor = {
            process: vi.fn(),
            prepareRequest: vi.fn(),
            getFunctionName: vi.fn(),
            llm: {},
            config: {}
        } as unknown as GraphLLMProcessor;
        operations = new GraphOperations(storage, mockLLMProcessor);
        vi.clearAllMocks();
    });

    describe('Basic Operations', () => {
        it('should add nodes and edges', async () => {
            const node1 = MockDataGenerator.generateNode();
            const node2 = MockDataGenerator.generateNode();
            
            await operations.addNode(node1);
            await operations.addNode(node2);
            
            const edge = MockDataGenerator.generateEdge(node1.id, node2.id);
            await operations.addEdge(edge);
            
            const nodes = await operations.getNodes({});
            const edges = await operations.getEdges({});
            
            expect(nodes).toHaveLength(2);
            expect(edges).toHaveLength(1);
        });

        it('should handle node updates', async () => {
            const node = MockDataGenerator.generateNode();
            await operations.addNode(node);
            
            const update = {
                ...node,
                content: 'Updated content'
            };
            
            await operations.updateNode(node.id, update);
            const nodes = await operations.getNodes({ nodeTypes: [node.type] });
            
            expect(nodes[0].content).toBe('Updated content');
        });
    });

    describe('Complex Operations', () => {
        it('should find paths between nodes', async () => {
            const nodeA = MockDataGenerator.generateNode();
            const nodeB = MockDataGenerator.generateNode();
            const nodeC = MockDataGenerator.generateNode();
            
            await operations.addNode(nodeA);
            await operations.addNode(nodeB);
            await operations.addNode(nodeC);
            
            await operations.addEdge(MockDataGenerator.generateEdge(nodeA.id, nodeB.id));
            await operations.addEdge(MockDataGenerator.generateEdge(nodeB.id, nodeC.id));
            
            vi.spyOn(mockLLMProcessor, 'process').mockImplementationOnce(async () => ({
                path: [nodeA.id, nodeB.id, nodeC.id],
                explanation: 'Test path'
            }));
            
            const results = await operations.findPath(nodeA.id, nodeC.id);
            expect(results[0].path).toHaveLength(3);
            expect(mockLLMProcessor.process).toHaveBeenCalled();
        });

        it('should detect communities', async () => {
            const nodes = Array(5).fill(null).map(() => MockDataGenerator.generateNode());
            await Promise.all(nodes.map(n => operations.addNode(n)));
            
            vi.spyOn(mockLLMProcessor, 'process').mockImplementationOnce(async () => ([{
                nodeIds: nodes.map(n => n.id),
                summary: 'Test community'
            }]));
            
            const result = await operations.detectCommunities();
            expect(result).toHaveLength(1);
            expect(mockLLMProcessor.process).toHaveBeenCalled();
        });

        it('should analyze temporal changes', async () => {
            const node = MockDataGenerator.generateNode();
            await operations.addNode(node);
            
            vi.spyOn(mockLLMProcessor, 'process').mockImplementationOnce(async () => ({
                source: node.id,
                target: node.id,
                relationship: 'updated',
                confidence: 0.8
            }));
            
            const result = await operations.analyzeTemporalChanges(node.id);
            expect(result.relationship).toBe('updated');
            expect(mockLLMProcessor.process).toHaveBeenCalled();
        });
    });

    describe('Filtering and Querying', () => {
        it('should filter nodes by type', async () => {
            const typeA = 'typeA';
            const typeB = 'typeB';
            
            await operations.addNode(MockDataGenerator.generateNode(typeA));
            await operations.addNode(MockDataGenerator.generateNode(typeA));
            await operations.addNode(MockDataGenerator.generateNode(typeB));
            
            const filter: GraphFilter = {
                nodeTypes: [typeA]
            };
            
            const nodes = await operations.getNodes(filter);
            expect(nodes).toHaveLength(2);
            nodes.forEach(node => expect(node.type).toBe(typeA));
        });

        it('should filter by time window', async () => {
            const now = new Date();
            const past = new Date(now.getTime() - 1000 * 60 * 60);
            const future = new Date(now.getTime() + 1000 * 60 * 60);
            
            // Create nodes with specific validAt times
            const node1 = MockDataGenerator.generateNode('entity', past);
            node1.validAt = past;
            const node2 = MockDataGenerator.generateNode('entity', now);
            node2.validAt = now;
            const node3 = MockDataGenerator.generateNode('entity', future);
            node3.validAt = future;
            
            await operations.addNode(node1);
            await operations.addNode(node2);
            await operations.addNode(node3);
            
            const filter: GraphFilter = {
                temporal: {
                    validAt: now
                }
            };
            
            const nodes = await operations.getNodes(filter);
            expect(nodes).toHaveLength(2);
            nodes.forEach(node => expect(node.validAt!.getTime()).toBeLessThanOrEqual(now.getTime()));
        });
    });
});
