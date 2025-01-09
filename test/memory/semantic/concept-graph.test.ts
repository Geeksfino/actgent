import { describe, test, expect, beforeEach } from 'bun:test';
import { ConceptGraph } from '../../../src/core/memory/semantic/ConceptGraph';
import { ConceptNode, ConceptRelation, RelationType } from '../../../src/core/memory/semantic/types';

describe('ConceptGraph', () => {
    let graph: ConceptGraph;

    beforeEach(() => {
        graph = new ConceptGraph();
    });

    test('should add and retrieve nodes', async () => {
        const node: ConceptNode = {
            id: 'test-1',
            label: 'test',
            type: 'concept',
            properties: new Map(),
            confidence: 0.8,
            lastUpdated: new Date(),
            source: ['memory-1']
        };

        await graph.addNode(node);
        const retrieved = await graph.getNode('test-1');
        expect(retrieved).toBeTruthy();
        expect(retrieved?.label).toBe('test');
    });

    test('should add and retrieve relations', async () => {
        const node1: ConceptNode = {
            id: 'cat',
            label: 'cat',
            type: 'concept',
            properties: new Map(),
            confidence: 0.8,
            lastUpdated: new Date(),
            source: ['memory-1']
        };

        const node2: ConceptNode = {
            id: 'animal',
            label: 'animal',
            type: 'concept',
            properties: new Map(),
            confidence: 0.9,
            lastUpdated: new Date(),
            source: ['memory-1']
        };

        await graph.addNode(node1);
        await graph.addNode(node2);

        const relation: ConceptRelation = {
            id: 'rel-1',
            sourceId: 'cat',
            targetId: 'animal',
            type: RelationType.IS_A,
            properties: new Map(),
            confidence: 0.9,
            lastUpdated: new Date(),
            source: ['memory-1']
        };

        await graph.addRelation(relation);
        const relations = await graph.getRelations('cat');
        expect(relations).toHaveLength(1);
        expect(relations[0].type).toBe(RelationType.IS_A);
    });

    test('should find path between nodes', async () => {
        // Create a chain: cat -> animal -> living thing
        const nodes: ConceptNode[] = [
            {
                id: 'cat',
                label: 'cat',
                type: 'concept',
                properties: new Map(),
                confidence: 0.8,
                lastUpdated: new Date(),
                source: ['memory-1']
            },
            {
                id: 'animal',
                label: 'animal',
                type: 'concept',
                properties: new Map(),
                confidence: 0.9,
                lastUpdated: new Date(),
                source: ['memory-1']
            },
            {
                id: 'living-thing',
                label: 'living thing',
                type: 'concept',
                properties: new Map(),
                confidence: 0.9,
                lastUpdated: new Date(),
                source: ['memory-1']
            }
        ];

        for (const node of nodes) {
            await graph.addNode(node);
        }

        const relations: ConceptRelation[] = [
            {
                id: 'rel-1',
                sourceId: 'cat',
                targetId: 'animal',
                type: RelationType.IS_A,
                properties: new Map(),
                confidence: 0.9,
                lastUpdated: new Date(),
                source: ['memory-1']
            },
            {
                id: 'rel-2',
                sourceId: 'animal',
                targetId: 'living-thing',
                type: RelationType.IS_A,
                properties: new Map(),
                confidence: 0.9,
                lastUpdated: new Date(),
                source: ['memory-1']
            }
        ];

        for (const relation of relations) {
            await graph.addRelation(relation);
        }

        const path = await graph.findPath('cat', 'living-thing');
        expect(path).toHaveLength(2);
        expect(path[0].sourceId).toBe('cat');
        expect(path[1].targetId).toBe('living-thing');
    });

    test('should merge nodes', async () => {
        const source: ConceptNode = {
            id: 'happy',
            label: 'happy',
            type: 'emotion',
            properties: new Map([['intensity', 0.8]]),
            confidence: 0.7,
            lastUpdated: new Date(),
            source: ['memory-1']
        };

        const target: ConceptNode = {
            id: 'joyful',
            label: 'joyful',
            type: 'emotion',
            properties: new Map([['intensity', 0.9]]),
            confidence: 0.8,
            lastUpdated: new Date(),
            source: ['memory-2']
        };

        await graph.addNode(source);
        await graph.addNode(target);

        const merged = await graph.merge(source, target);
        expect(merged.confidence).toBe(0.8); // Higher confidence
        expect(merged.properties.get('intensity')).toBe(0.9); // Target property preserved
        expect(merged.source).toContain('memory-1');
        expect(merged.source).toContain('memory-2');

        // Original source node should be deleted
        const sourceNode = await graph.getNode('happy');
        expect(sourceNode).toBeNull();
    });

    test('should handle bidirectional relationships', async () => {
        const node1: ConceptNode = {
            id: 'happy',
            label: 'happy',
            type: 'emotion',
            properties: new Map(),
            confidence: 0.8,
            lastUpdated: new Date(),
            source: ['memory-1']
        };

        const node2: ConceptNode = {
            id: 'joyful',
            label: 'joyful',
            type: 'emotion',
            properties: new Map(),
            confidence: 0.8,
            lastUpdated: new Date(),
            source: ['memory-1']
        };

        await graph.addNode(node1);
        await graph.addNode(node2);

        const relation: ConceptRelation = {
            id: 'rel-1',
            sourceId: 'happy',
            targetId: 'joyful',
            type: RelationType.SIMILAR_TO,
            properties: new Map(),
            confidence: 0.9,
            lastUpdated: new Date(),
            source: ['memory-1']
        };

        await graph.addRelation(relation);

        // Both nodes should have the relation
        const relations1 = await graph.getRelations('happy');
        const relations2 = await graph.getRelations('joyful');
        expect(relations1).toHaveLength(1);
        expect(relations2).toHaveLength(1);
    });
});
