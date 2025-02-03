import { describe, it, expect } from 'vitest';
import { InMemoryGraphStorage } from '../../src/core/memory/graph/data/InMemoryGraphStorage';
import { IGraphNode, IGraphEdge } from '../../src/core/memory/graph/data/types';

describe('Temporal Operations', () => {
    it('should validate temporal consistency', async () => {
        const storage = new InMemoryGraphStorage();
        
        // Test valid temporal data
        const validNode: IGraphNode = {
            id: '1',
            type: 'test',
            content: {},
            metadata: new Map(),
            createdAt: new Date('2024-01-01'),
            expiredAt: new Date('2024-01-02'),
            validAt: new Date('2024-01-01')
        };
        
        await expect(storage.addNode(validNode)).resolves.toBeDefined();
        
        // Test invalid temporal data
        const invalidNode: IGraphNode = {
            id: '2',
            type: 'test',
            content: {},
            metadata: new Map(),
            createdAt: new Date('2024-01-02'),
            expiredAt: new Date('2024-01-01'), // Invalid: expired before created
            validAt: new Date('2024-01-01')
        };
        
        await expect(storage.addNode(invalidNode)).rejects.toThrow('expiredAt must be after createdAt');
        
        // Test edge temporal validation
        const node1 = await storage.addNode({
            id: '3',
            type: 'test',
            content: {},
            metadata: new Map(),
            createdAt: new Date('2024-01-01')
        });
        
        const node2 = await storage.addNode({
            id: '4',
            type: 'test',
            content: {},
            metadata: new Map(),
            createdAt: new Date('2024-01-01')
        });
        
        const validEdge: IGraphEdge = {
            id: '5',
            type: 'test',
            sourceId: '3',
            targetId: '4',
            content: {},
            metadata: new Map(),
            createdAt: new Date('2024-01-01'),
            validAt: new Date('2024-01-01'),
            invalidAt: new Date('2024-01-02')
        };
        
        await expect(storage.addEdge(validEdge)).resolves.toBeDefined();
        
        const invalidEdge: IGraphEdge = {
            id: '6',
            type: 'test',
            sourceId: '3',
            targetId: '4',
            content: {},
            metadata: new Map(),
            createdAt: new Date('2024-01-01'),
            validAt: new Date('2024-01-02'),
            invalidAt: new Date('2024-01-01') // Invalid: invalid before valid
        };
        
        await expect(storage.addEdge(invalidEdge)).rejects.toThrow('validAt must be before invalidAt');
    });
    
    it('should handle temporal queries correctly', async () => {
        const storage = new InMemoryGraphStorage();
        
        // Add test data
        await storage.addNode({
            id: '1',
            type: 'test',
            content: { value: 1 },
            metadata: new Map(),
            createdAt: new Date('2024-01-01'),
            validAt: new Date('2024-01-01')
        });
        
        await storage.addNode({
            id: '2',
            type: 'test',
            content: { value: 2 },
            metadata: new Map(),
            createdAt: new Date('2024-01-02'),
            validAt: new Date('2024-01-02')
        });
        
        await storage.addEdge({
            id: '3',
            type: 'test',
            sourceId: '1',
            targetId: '2',
            content: {},
            metadata: new Map(),
            createdAt: new Date('2024-01-01'),
            validAt: new Date('2024-01-01'),
            expiredAt: new Date('2024-01-03'),
            invalidAt: new Date('2024-01-04')
        });
        
        // Test point-in-time query
        const result1 = await storage.query({
            temporal: {
                validAt: new Date('2024-01-02')
            }
        });
        
        expect(result1.nodes.length).toBeGreaterThanOrEqual(1);
        expect(result1.edges.length).toBeGreaterThanOrEqual(1);
        
        // Test range query
        const result2 = await storage.query({
            temporal: {
                validAfter: new Date('2024-01-02'),
                validBefore: new Date('2024-01-04')
            }
        });
        
        expect(result2.nodes.length).toBeGreaterThanOrEqual(1);
        expect(result2.edges.length).toBe(0); // Edge is invalid after 2024-01-03
    });
});
