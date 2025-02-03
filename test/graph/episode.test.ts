import { describe, it, expect } from 'vitest';
import { InMemoryGraphStorage } from '../../src/core/memory/graph/data/InMemoryGraphStorage';
import { IGraphNode, EpisodeContent, GraphNodeType } from '../../src/core/memory/graph/data/types';

describe('Episode Node Operations', () => {
    it('should validate episode temporal consistency', async () => {
        const storage = new InMemoryGraphStorage();
        
        // Valid episode node
        const validNode: IGraphNode<EpisodeContent> = {
            id: '1',
            type: GraphNodeType.EPISODE,
            content: {
                body: 'test message',
                source: 'chat',
                sourceDescription: 'user message',
                timestamp: new Date('2024-01-01')
            },
            metadata: new Map(),
            createdAt: new Date('2024-01-01'),
            validAt: new Date('2024-01-01')
        };
        
        await expect(storage.addNode(validNode)).resolves.toBeDefined();
        
        // Invalid episode node - missing timestamp
        const invalidNode1: IGraphNode<EpisodeContent> = {
            id: '2',
            type: GraphNodeType.EPISODE,
            content: {
                body: 'test message',
                source: 'chat',
                sourceDescription: 'user message',
                timestamp: undefined as any
            },
            metadata: new Map(),
            createdAt: new Date('2024-01-01')
        };
        
        await expect(storage.addNode(invalidNode1)).rejects.toThrow('Episode nodes must have a timestamp');
        
        // Invalid episode node - mismatched validAt
        const invalidNode2: IGraphNode<EpisodeContent> = {
            id: '3',
            type: GraphNodeType.EPISODE,
            content: {
                body: 'test message',
                source: 'chat',
                sourceDescription: 'user message',
                timestamp: new Date('2024-01-01')
            },
            metadata: new Map(),
            createdAt: new Date('2024-01-01'),
            validAt: new Date('2024-01-02')  // Different from timestamp
        };
        
        await expect(storage.addNode(invalidNode2)).rejects.toThrow('Episode validAt must match content timestamp');
    });
    
    it('should retrieve episode timeline correctly', async () => {
        const storage = new InMemoryGraphStorage();
        
        // Add test episodes
        const episodes = [
            {
                id: '1',
                type: GraphNodeType.EPISODE,
                content: {
                    body: 'first message',
                    source: 'chat',
                    sourceDescription: 'user message',
                    timestamp: new Date('2024-01-01')
                },
                metadata: new Map(),
                createdAt: new Date('2024-01-01'),
                validAt: new Date('2024-01-01')
            },
            {
                id: '2',
                type: GraphNodeType.EPISODE,
                content: {
                    body: 'second message',
                    source: 'chat',
                    sourceDescription: 'user message',
                    timestamp: new Date('2024-01-02')
                },
                metadata: new Map(),
                createdAt: new Date('2024-01-02'),
                validAt: new Date('2024-01-02')
            },
            {
                id: '3',
                type: GraphNodeType.EPISODE,
                content: {
                    body: 'third message',
                    source: 'chat',
                    sourceDescription: 'user message',
                    timestamp: new Date('2024-01-03')
                },
                metadata: new Map(),
                createdAt: new Date('2024-01-03'),
                validAt: new Date('2024-01-03')
            }
        ];
        
        for (const episode of episodes) {
            await storage.addNode(episode);
        }
        
        // Test timeline retrieval
        const timeline = await storage.getEpisodeTimeline(
            new Date('2024-01-01'),
            new Date('2024-01-02')
        );
        
        expect(timeline).toHaveLength(2);
        expect(timeline[0].id).toBe('1');
        expect(timeline[1].id).toBe('2');
        
        // Test expired node exclusion
        await storage.updateNode('1', { expiredAt: new Date() });
        
        const timelineAfterExpiry = await storage.getEpisodeTimeline(
            new Date('2024-01-01'),
            new Date('2024-01-02')
        );
        
        expect(timelineAfterExpiry).toHaveLength(1);
        expect(timelineAfterExpiry[0].id).toBe('2');
    });
    
    it('should filter episodes by source and time range', async () => {
        const storage = new InMemoryGraphStorage();
        
        // Add test episodes
        const episodes = [
            {
                id: '1',
                type: GraphNodeType.EPISODE,
                content: {
                    body: 'chat message 1',
                    source: 'chat',
                    sourceDescription: 'user message',
                    timestamp: new Date('2024-01-01')
                },
                metadata: new Map(),
                createdAt: new Date('2024-01-01'),
                validAt: new Date('2024-01-01')
            },
            {
                id: '2',
                type: GraphNodeType.EPISODE,
                content: {
                    body: 'chat message 2',
                    source: 'chat',
                    sourceDescription: 'user message',
                    timestamp: new Date('2024-01-02')
                },
                metadata: new Map(),
                createdAt: new Date('2024-01-02'),
                validAt: new Date('2024-01-02')
            },
            {
                id: '3',
                type: GraphNodeType.EPISODE,
                content: {
                    body: 'api call',
                    source: 'api',
                    sourceDescription: 'api response',
                    timestamp: new Date('2024-01-02')
                },
                metadata: new Map(),
                createdAt: new Date('2024-01-02'),
                validAt: new Date('2024-01-02')
            }
        ];
        
        for (const episode of episodes) {
            await storage.addNode(episode);
        }
        
        // Test source filtering
        const chatEpisodes = await storage.query({
            episode: {
                source: 'chat'
            }
        });
        
        expect(chatEpisodes.nodes).toHaveLength(2);
        expect(chatEpisodes.nodes.every(n => 
            (n as IGraphNode<EpisodeContent>).content.source === 'chat'
        )).toBe(true);
        
        // Test time range filtering
        const timeRangeEpisodes = await storage.query({
            episode: {
                timeRange: {
                    start: new Date('2024-01-02'),
                    end: new Date('2024-01-03')
                }
            }
        });
        
        expect(timeRangeEpisodes.nodes).toHaveLength(2);
        expect(timeRangeEpisodes.nodes.every(n => 
            n.validAt! >= new Date('2024-01-02') &&
            n.validAt! <= new Date('2024-01-03')
        )).toBe(true);
        
        // Test combined filtering
        const combinedFilter = await storage.query({
            episode: {
                source: 'chat',
                timeRange: {
                    start: new Date('2024-01-02'),
                    end: new Date('2024-01-03')
                }
            }
        });
        
        expect(combinedFilter.nodes).toHaveLength(1);
        const node = combinedFilter.nodes[0] as IGraphNode<EpisodeContent>;
        expect(node.content.source).toBe('chat');
        expect(node.validAt).toEqual(new Date('2024-01-02'));
    });

    it('should filter episodes by entity references', async () => {
        const storage = new InMemoryGraphStorage();
        
        // Add test entity
        const entity = {
            id: 'entity1',
            type: GraphNodeType.ENTITY,
            content: { name: 'Test Entity' },
            metadata: new Map(),
            createdAt: new Date()
        };
        await storage.addNode(entity);
        
        // Add test episodes
        const episodes = [
            {
                id: 'episode1',
                type: GraphNodeType.EPISODE,
                content: {
                    body: 'references entity',
                    source: 'chat',
                    sourceDescription: 'user message',
                    timestamp: new Date()
                },
                metadata: new Map(),
                createdAt: new Date(),
                validAt: new Date()
            },
            {
                id: 'episode2',
                type: GraphNodeType.EPISODE,
                content: {
                    body: 'no reference',
                    source: 'chat',
                    sourceDescription: 'user message',
                    timestamp: new Date()
                },
                metadata: new Map(),
                createdAt: new Date(),
                validAt: new Date()
            }
        ];
        
        for (const episode of episodes) {
            await storage.addNode(episode);
        }
        
        // Add edge connecting episode1 to entity
        await storage.addEdge({
            id: 'edge1',
            type: 'references',
            sourceId: 'episode1',
            targetId: 'entity1',
            content: {},
            metadata: new Map(),
            createdAt: new Date()
        });
        
        // Test entity reference filtering
        const result = await storage.query({
            episode: {
                entityIds: ['entity1']
            }
        });
        
        expect(result.nodes).toHaveLength(1);
        expect(result.nodes[0].id).toBe('episode1');
    });
});
