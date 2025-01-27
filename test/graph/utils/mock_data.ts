import { IGraphNode, IGraphEdge, IGraphMemoryUnit, GraphMemoryType } from '../../../src/core/memory/graph/data/types';

export interface MockDataConfig {
    numNodes: number;
    numEdges: number;
    timeSpan: number; // in days
    contentTypes: string[];
}

export interface MockConversationConfig {
    turns: number;
    participantIds: string[];
    timeSpan: number; // in hours
}

export class MockDataGenerator {
    private static idCounter = 0;

    private static generateId(prefix: string): string {
        return `${prefix}_${++MockDataGenerator.idCounter}`;
    }

    private static randomDate(start: Date, end: Date): Date {
        return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
    }

    static generateNode(type: string = 'entity', baseTime: Date = new Date()): IGraphNode {
        const metadata = new Map<string, any>();
        metadata.set('source', 'test');
        metadata.set('confidence', Math.random());

        // Ensure createdAt is always before validAt
        const createdAt = new Date(baseTime.getTime() - 86400000); // 24h before baseTime

        return {
            id: this.generateId('node'),
            type,
            content: `Test content for ${type}`,
            metadata,
            createdAt,
            validAt: baseTime
        };
    }

    static generateEdge(sourceId: string, targetId: string, type: string = 'relates_to'): IGraphEdge {
        const metadata = new Map<string, any>();
        metadata.set('confidence', Math.random());

        return {
            id: this.generateId('edge'),
            type,
            sourceId,
            targetId,
            content: `${type} relationship`,
            metadata,
            createdAt: new Date(),
            weight: Math.random()
        };
    }

    static generateMemoryUnit(type: GraphMemoryType = GraphMemoryType.SEMANTIC): IGraphMemoryUnit {
        const baseNode = this.generateNode('memory');
        return {
            ...baseNode,
            memoryType: type,
            importance: Math.random(),
            lastAccessed: new Date(),
            accessCount: Math.floor(Math.random() * 10),
            episodeIds: [this.generateId('episode')]
        };
    }

    static generateGraph(config: MockDataConfig): {
        nodes: IGraphNode[];
        edges: IGraphEdge[];
        memoryUnits: IGraphMemoryUnit[];
    } {
        const nodes: IGraphNode[] = [];
        const edges: IGraphEdge[] = [];
        const memoryUnits: IGraphMemoryUnit[] = [];

        // Generate base timeframe
        const endTime = new Date();
        const startTime = new Date(endTime.getTime() - config.timeSpan * 86400000);

        // Generate nodes
        for (let i = 0; i < config.numNodes; i++) {
            const type = config.contentTypes[i % config.contentTypes.length];
            nodes.push(this.generateNode(type, this.randomDate(startTime, endTime)));
        }

        // Generate edges
        let edgeCount = 0;
        while (edgeCount < config.numEdges) {
            const sourceIdx = Math.floor(Math.random() * nodes.length);
            const targetIdx = Math.floor(Math.random() * nodes.length);
            if (sourceIdx !== targetIdx) {
                edges.push(this.generateEdge(nodes[sourceIdx].id, nodes[targetIdx].id));
                edgeCount++;
            }
        }

        // Generate memory units (10% of node count)
        const memoryCount = Math.max(1, Math.floor(config.numNodes * 0.1));
        for (let i = 0; i < memoryCount; i++) {
            const type = i % 2 === 0 ? GraphMemoryType.SEMANTIC : GraphMemoryType.EPISODIC;
            memoryUnits.push(this.generateMemoryUnit(type));
        }

        return { nodes, edges, memoryUnits };
    }

    static generateConversation(config: MockConversationConfig): {
        messages: Array<{ id: string; content: string; timestamp: Date; participantId: string }>;
    } {
        const messages = [];
        const endTime = new Date();
        const startTime = new Date(endTime.getTime() - config.timeSpan * 3600000);

        for (let i = 0; i < config.turns; i++) {
            const participantId = config.participantIds[i % config.participantIds.length];
            messages.push({
                id: this.generateId('msg'),
                content: `Test message ${i + 1} from ${participantId}`,
                timestamp: this.randomDate(startTime, endTime),
                participantId
            });
        }

        // Sort messages by timestamp
        messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        return { messages };
    }
}
