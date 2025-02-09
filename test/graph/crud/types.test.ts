import { describe, it, expect } from 'vitest';
import { IGraphNode, IGraphEdge, IGraphMemoryUnit, GraphMemoryType } from '../../../src/core/memory/graph/data/types';
import { MockDataGenerator } from '../utils/mock_data';

describe('Graph Data Types', () => {
    describe('IGraphNode', () => {
        it('should create node with all required fields', () => {
            const node = MockDataGenerator.generateNode();
            
            expect(node.id).toBeDefined();
            expect(node.type).toBeDefined();
            expect(node.content).toBeDefined();
            expect(node.metadata).toBeInstanceOf(Map);
            expect(node.createdAt).toBeInstanceOf(Date);
        });

        it('should validate metadata types', () => {
            const node = MockDataGenerator.generateNode();
            
            expect(node.metadata.get('confidence')).toBeTypeOf('number');
            expect(node.metadata.get('source')).toBeTypeOf('string');
        });

        it('should handle temporal fields correctly', () => {
            const now = new Date();
            const node = MockDataGenerator.generateNode('entity', now);
            
            expect(node.createdAt.getTime()).toBeLessThanOrEqual(now.getTime());
            expect(node.validAt?.getTime()).toBeLessThanOrEqual(now.getTime());
            
            if (node.expiredAt) {
                expect(node.expiredAt.getTime()).toBeGreaterThan(node.createdAt.getTime());
            }
        });
    });

    describe('IGraphEdge', () => {
        it('should create edge with valid source and target', () => {
            const sourceId = 'source_1';
            const targetId = 'target_1';
            const edge = MockDataGenerator.generateEdge(sourceId, targetId);
            
            expect(edge.sourceId).toBe(sourceId);
            expect(edge.targetId).toBe(targetId);
            expect(edge.weight).toBeGreaterThanOrEqual(0);
            expect(edge.weight).toBeLessThanOrEqual(1);
        });

        it('should handle edge metadata', () => {
            const edge = MockDataGenerator.generateEdge('source_1', 'target_1');
            
            expect(edge.metadata).toBeInstanceOf(Map);
            expect(edge.metadata.get('confidence')).toBeTypeOf('number');
        });
    });

    describe('IGraphMemoryUnit', () => {
        it('should extend IGraphNode correctly', () => {
            const memoryUnit = MockDataGenerator.generateMemoryUnit();
            
            // Should have all IGraphNode properties
            expect(memoryUnit.id).toBeDefined();
            expect(memoryUnit.type).toBeDefined();
            expect(memoryUnit.content).toBeDefined();
            expect(memoryUnit.metadata).toBeInstanceOf(Map);
            expect(memoryUnit.createdAt).toBeInstanceOf(Date);
            
            // Should have additional IGraphMemoryUnit properties
            expect(memoryUnit.memoryType).toBeDefined();
            expect(memoryUnit.importance).toBeTypeOf('number');
            expect(memoryUnit.accessCount).toBeTypeOf('number');
            expect(Array.isArray(memoryUnit.episodeIds)).toBe(true);
        });

        it('should handle different memory types', () => {
            const semanticMemory = MockDataGenerator.generateMemoryUnit(GraphMemoryType.SEMANTIC);
            const episodicMemory = MockDataGenerator.generateMemoryUnit(GraphMemoryType.EPISODIC);
            
            expect(semanticMemory.memoryType).toBe(GraphMemoryType.SEMANTIC);
            expect(episodicMemory.memoryType).toBe(GraphMemoryType.EPISODIC);
        });

        it('should track access information', () => {
            const memoryUnit = MockDataGenerator.generateMemoryUnit();
            
            expect(memoryUnit.lastAccessed).toBeInstanceOf(Date);
            expect(memoryUnit.accessCount).toBeGreaterThanOrEqual(0);
            expect(memoryUnit.importance).toBeGreaterThanOrEqual(0);
            expect(memoryUnit.importance).toBeLessThanOrEqual(1);
        });
    });

    describe('Graph Generation', () => {
        it('should generate valid graph structure', () => {
            const config = {
                numNodes: 10,
                numEdges: 15,
                timeSpan: 7,
                contentTypes: ['person', 'location', 'event']
            };
            
            const { nodes, edges, memoryUnits } = MockDataGenerator.generateGraph(config);
            
            expect(nodes).toHaveLength(config.numNodes);
            expect(edges).toHaveLength(config.numEdges);
            expect(memoryUnits).toHaveLength(Math.floor(config.numNodes * 0.1));
            
            // Verify edge references are valid
            edges.forEach(edge => {
                const sourceExists = nodes.some(node => node.id === edge.sourceId);
                const targetExists = nodes.some(node => node.id === edge.targetId);
                expect(sourceExists).toBe(true);
                expect(targetExists).toBe(true);
            });
        });
    });
});
