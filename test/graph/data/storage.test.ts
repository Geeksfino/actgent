import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryGraphStorage } from '../../../src/core/memory/graph/data/InMemoryGraphStorage';
import { GraphFilter, IGraphNode, IGraphEdge, GraphMemoryType } from '../../../src/core/memory/graph/data/types';
import { MockDataGenerator } from '../utils/mock_data';

describe('InMemoryGraphStorage', () => {
    let storage: InMemoryGraphStorage;

    beforeEach(() => {
        storage = new InMemoryGraphStorage();
    });

    describe('Basic Operations', () => {
        it('should add and retrieve nodes', async () => {
            const node = MockDataGenerator.generateNode();
            const id = await storage.addNode(node);
            
            const retrieved = await storage.getNode(id);
            expect(retrieved).toBeDefined();
            expect(retrieved?.id).toBe(id);
            expect(retrieved?.content).toBe(node.content);
        });

        it('should add and retrieve edges', async () => {
            const node1 = MockDataGenerator.generateNode();
            const node2 = MockDataGenerator.generateNode();
            
            const id1 = await storage.addNode(node1);
            const id2 = await storage.addNode(node2);
            
            const edge = MockDataGenerator.generateEdge(id1, id2);
            const edgeId = await storage.addEdge(edge);
            
            const retrieved = await storage.getEdge(edgeId);
            expect(retrieved).toBeDefined();
            expect(retrieved?.sourceId).toBe(id1);
            expect(retrieved?.targetId).toBe(id2);
        });

        it('should handle node updates', async () => {
            const node = MockDataGenerator.generateNode();
            const id = await storage.addNode(node);
            
            const update = {
                ...node,
                content: 'Updated content'
            };
            
            await storage.updateNode(id, update);
            const retrieved = await storage.getNode(id);
            
            expect(retrieved?.content).toBe('Updated content');
        });

        it('should handle node deletion', async () => {
            const node = MockDataGenerator.generateNode();
            const id = await storage.addNode(node);
            
            await storage.deleteNode(id);
            const retrieved = await storage.getNode(id);
            
            expect(retrieved).toBeNull();
        });
    });

    describe('Temporal Operations', () => {
        it('should handle time-based queries', async () => {
            const now = new Date();
            const past = new Date(now.getTime() - 1000 * 60 * 60); // 1 hour ago
            const future = new Date(now.getTime() + 1000 * 60 * 60); // 1 hour from now
            
            // Create nodes with specific validAt times
            const node1 = MockDataGenerator.generateNode('entity', past);
            node1.validAt = past;
            const node2 = MockDataGenerator.generateNode('entity', now);
            node2.validAt = now;
            const node3 = MockDataGenerator.generateNode('entity', future);
            node3.validAt = future;
            
            await storage.addNode(node1);
            await storage.addNode(node2);
            await storage.addNode(node3);
            
            const filter: GraphFilter = {
                temporal: {
                    validAt: now
                }
            };
            
            const results = await storage.query(filter);
            expect(results.nodes.length).toBe(2); // Only past and present nodes should be valid
        });

        it('should track temporal validity', async () => {
            const now = new Date();
            const node = MockDataGenerator.generateNode();
            node.validAt = now;
            node.expiredAt = new Date(now.getTime() + 1000 * 60 * 60); // 1 hour from now
            
            const id = await storage.addNode(node);
            
            // Query before expiry (30 mins from now)
            const beforeExpiry = await storage.query({
                temporal: {
                    validAt: new Date(now.getTime() + 1000 * 60 * 30)
                }
            });
            expect(beforeExpiry.nodes).toHaveLength(1);
            
            // Query after expiry (2 hours from now)
            const afterExpiry = await storage.query({
                temporal: {
                    validAt: new Date(now.getTime() + 1000 * 60 * 60 * 2)
                }
            });
            expect(afterExpiry.nodes).toHaveLength(0);
        });
    });

    describe('Graph Traversal', () => {
        it('should traverse connected nodes', async () => {
            // Create a small graph: A -> B -> C
            const nodeA = MockDataGenerator.generateNode();
            const nodeB = MockDataGenerator.generateNode();
            const nodeC = MockDataGenerator.generateNode();
            
            const idA = await storage.addNode(nodeA);
            const idB = await storage.addNode(nodeB);
            const idC = await storage.addNode(nodeC);
            
            const edgeAB = MockDataGenerator.generateEdge(idA, idB);
            const edgeBC = MockDataGenerator.generateEdge(idB, idC);
            
            await storage.addEdge(edgeAB);
            await storage.addEdge(edgeBC);
            
            const options = {
                maxDepth: 2,
                direction: 'outbound' as const
            };
            
            const result = await storage.traverse(idA, options);
            
            // Should find all nodes
            expect(result.nodes).toHaveLength(3);
            expect(result.nodes.map(n => n.id)).toContain(idA);
            expect(result.nodes.map(n => n.id)).toContain(idB);
            expect(result.nodes.map(n => n.id)).toContain(idC);
            
            // Should find only forward edges
            expect(result.edges).toHaveLength(2);
            expect(result.edges.map(e => e.id)).toContain(edgeAB.id);
            expect(result.edges.map(e => e.id)).toContain(edgeBC.id);
        });

        it('should respect traversal depth limits', async () => {
            // Create a chain: A -> B -> C -> D
            const nodes = Array(4).fill(null).map(() => MockDataGenerator.generateNode());
            const ids = await Promise.all(nodes.map(n => storage.addNode(n)));
            
            for (let i = 0; i < ids.length - 1; i++) {
                await storage.addEdge(MockDataGenerator.generateEdge(ids[i], ids[i + 1]));
            }
            
            const result1 = await storage.traverse(ids[0], { maxDepth: 1 });
            expect(result1.nodes).toHaveLength(2);
            
            const result2 = await storage.traverse(ids[0], { maxDepth: 3 });
            expect(result2.nodes).toHaveLength(4);
        });
    });

    describe('Concurrent Operations', () => {
        it('should handle concurrent node additions', async () => {
            const nodes = Array(10).fill(null).map(() => MockDataGenerator.generateNode());
            const promises = nodes.map(n => storage.addNode(n));
            
            const ids = await Promise.all(promises);
            expect(ids).toHaveLength(nodes.length);
            
            const retrievedNodes = await Promise.all(ids.map(id => storage.getNode(id)));
            expect(retrievedNodes.filter(n => n !== null)).toHaveLength(nodes.length);
        });

        it('should handle concurrent edge additions', async () => {
            // Create nodes first
            const nodes = Array(5).fill(null).map(() => MockDataGenerator.generateNode());
            const nodeIds = await Promise.all(nodes.map(n => storage.addNode(n)));
            
            // Create edges between random nodes
            const edges = Array(10).fill(null).map(() => {
                const sourceIdx = Math.floor(Math.random() * nodeIds.length);
                const targetIdx = Math.floor(Math.random() * nodeIds.length);
                return MockDataGenerator.generateEdge(nodeIds[sourceIdx], nodeIds[targetIdx]);
            });
            
            const edgePromises = edges.map(e => storage.addEdge(e));
            const edgeIds = await Promise.all(edgePromises);
            
            expect(edgeIds).toHaveLength(edges.length);
            
            const retrievedEdges = await Promise.all(edgeIds.map(id => storage.getEdge(id)));
            expect(retrievedEdges.filter(e => e !== null)).toHaveLength(edges.length);
        });
    });
});
