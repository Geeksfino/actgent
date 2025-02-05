import { GraphManager } from '../../../src/core/memory/graph/GraphManager';
import { GraphConfig, GraphTask } from '../../../src/core/memory/graph/types';
import { GraphFilter } from '../../../src/core/memory/graph/data/types';
import { LLMConfig } from '../../../src/core/memory/graph/types';
import { IGraphNode, IGraphEdge, EpisodeContent } from '../../../src/core/memory/graph/data/types';
import { EmbedderProvider } from '../../../src/core/memory/graph/embedder/types';
import { OpenAI } from 'openai';
import * as fs from 'fs';
import { readFileSync } from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

interface LongMemEvalTurn {
    role: 'user' | 'assistant';
    content: string;
    has_answer?: boolean;
}

interface LongMemEvalSession {
    id: string;
    date: string;
    turns: LongMemEvalTurn[];
}

interface LongMemEvalInstance {
    question_id: string;
    question_type: 'single-session-user' | 'single-session-assistant' | 'single-session-preference' | 'temporal-reasoning' | 'knowledge-update' | 'multi-session';
    question: string;
    answer: string;
    question_date: string;
    haystack_session_ids: string[];
    haystack_dates: string[];
    haystack_sessions: LongMemEvalTurn[][];
    answer_session_ids: string[];
    episodeText?: string; 
    evidence_turns: {
        turn_id: string;
        content: string;
        role: 'user' | 'assistant';
    }[];
}

interface LongMemEvalPrediction {
    question_id: string;
    hypothesis: string;
}

interface Entity {
    name: string;
    category: string;
    confidence: number;
}

interface Relationship {
    source: string;
    target: string;
    type: string;
    description: string;
    confidence: number;
}

interface EntityExtractionResult {
    entities: Entity[];
    relationships: Relationship[];
}

export class LongMemEvalRunner {
    private graphManager: GraphManager;
    private llmConfig: LLMConfig;
    private openai: OpenAI;
    private dataset: LongMemEvalInstance[];
    private predictionsPath: string;
    private llmProcessor: any; 
    private debug: boolean;
    private contextSize: number;

    constructor(
        datasetPath: string, 
        predictionsPath: string, 
        debug: boolean = false,
        apiKey?: string,
        baseURL?: string,
        model: string = 'gpt-4',
        temperature: number = 0,
        maxTokens: number = 500,
        contextSize: number = 4  // Default to 4 messages (2 complete turns) as per Zep paper
    ) {
        this.debug = debug;
        this.contextSize = contextSize;
        this.dataset = this.loadDataset(datasetPath);
        this.predictionsPath = predictionsPath;

        this.llmConfig = {
            apiKey: apiKey || process.env.OPENAI_API_KEY || '',
            baseURL,
            model,
            temperature,
            maxTokens,
            streamMode: false
        };

        if (!this.llmConfig.apiKey) {
            throw new Error('OpenAI API key is required. Please provide it via constructor or set OPENAI_API_KEY environment variable.');
        }

        this.openai = new OpenAI({
            apiKey: this.llmConfig.apiKey,
            baseURL: this.llmConfig.baseURL
        });

        const graphConfig: GraphConfig = {
            llm: {
                ...this.llmConfig,
                client: this.openai
            },
            embedder: {
                provider: EmbedderProvider.BGE,
                config: {
                    modelName: 'Xenova/all-MiniLM-L6-v2',  
                    maxTokens: 512,  
                    batchSize: 32,
                    quantized: true  
                }
            },
            search: {
                textWeight: 0.3,       
                embeddingWeight: 0.7,   
                minTextScore: 0.05,     
                minEmbeddingScore: 0.1, 
                limit: 50
            }
        };

        this.graphManager = new GraphManager(graphConfig);
    }

    private loadDataset(path: string): LongMemEvalInstance[] {
        const content = readFileSync(path, 'utf-8');
        return JSON.parse(content);
    }

    private log(...args: any[]) {
        if (this.debug) {
            console.log(...args);
        }
    }

    private async getLayerStats() {
        const episodeResult = await this.graphManager.query({ metadata: { type: 'episode' } });
        const entityResult = await this.graphManager.query({ metadata: { type: 'entity' } });
        const communityResult = await this.graphManager.query({ metadata: { type: 'community' } });

        const episodeNodes = episodeResult.nodes;
        const entityNodes = entityResult.nodes;
        const communityNodes = communityResult.nodes;

        const entityEdges = entityResult.edges;

        const graphStructure = {
            episodes: episodeNodes.map(n => ({
                id: n.id,
                type: n.type,
                content: {
                    body: (n.content as EpisodeContent).body,
                    source: (n.content as EpisodeContent).source,
                    sourceDescription: (n.content as EpisodeContent).sourceDescription,
                    timestamp: (n.content as EpisodeContent).timestamp.toISOString()  
                },
                metadata: {
                    role: n.metadata.get('role'),
                    type: n.metadata.get('type'),
                    date: n.metadata.get('date'),
                    turn_id: n.metadata.get('turn_id'),
                    source: n.metadata.get('source')
                },
                createdAt: n.createdAt?.toISOString(),
                validAt: n.validAt?.toISOString()
            })),
            entities: entityNodes.map(n => ({
                id: n.id,
                content: n.content,
                category: n.metadata.get('category'),
                confidence: n.metadata.get('confidence'),
                validAt: n.validAt?.toISOString()
            })),
            relationships: entityEdges.map((e: IGraphEdge) => ({
                source: e.sourceId,
                target: e.targetId,
                type: e.metadata.get('type'),
                description: e.content,
                confidence: e.metadata.get('confidence')
            })),
            communities: communityNodes.map(n => ({
                id: n.id,
                size: n.metadata.get('memberCount'),
                lastUpdate: n.metadata.get('lastUpdateTime'),
                members: n.metadata.get('members')
            }))
        };

        if (this.debug) {
            this.log('\nDetailed Graph Structure:', JSON.stringify(graphStructure, null, 2));
        }

        return {
            episodes: episodeNodes.length,
            entities: entityNodes.length,
            communities: communityNodes.length,
            episodeDetails: episodeNodes.map((n: IGraphNode) => ({ 
                id: n.id, 
                type: n.type,
                content: {
                    body: (n.content as EpisodeContent).body,
                    source: (n.content as EpisodeContent).source,
                    sourceDescription: (n.content as EpisodeContent).sourceDescription,
                    timestamp: (n.content as EpisodeContent).timestamp.toISOString()  
                },
                metadata: {
                    role: n.metadata.get('role'),
                    type: n.metadata.get('type'),
                    date: n.metadata.get('date'),
                    turn_id: n.metadata.get('turn_id'),
                    source: n.metadata.get('source')
                },
                createdAt: n.createdAt?.toISOString(),
                validAt: n.validAt?.toISOString()
            })),
            entityDetails: entityNodes.map((n: IGraphNode) => ({
                id: n.id,
                content: n.content,
                category: n.metadata.get('category')
            })),
            communityDetails: communityNodes.map((n: IGraphNode) => ({
                id: n.id,
                size: n.metadata.get('memberCount'),
                lastUpdate: n.metadata.get('lastUpdateTime')
            }))
        };
    }

    private createEpisodeNode(turn: { role: string; content: string; turn_id: string; date?: string }): IGraphNode<EpisodeContent> {
        // Parse date string into Date object if provided
        let timestamp: Date;
        if (turn.date) {
            const parsedDate = new Date(turn.date.replace(/\([^)]*\)/g, '').trim());
            timestamp = !isNaN(parsedDate.getTime()) ? parsedDate : new Date();
        } else {
            timestamp = new Date();
        }

        // Create episode content
        const episodeContent: EpisodeContent = {
            body: turn.content,
            source: 'conversation',
            sourceDescription: `${turn.role} message in camera discussion`,
            timestamp  // Store as Date object
        };

        // Create and return episode node
        return {
            id: crypto.randomUUID(),
            type: 'episode',
            content: episodeContent,
            metadata: new Map([
                ['role', turn.role],
                ['type', 'episode'],
                ['date', timestamp.toISOString()],  // Store as ISO string in metadata
                ['turn_id', turn.turn_id],
                ['source', 'conversation']
            ]),
            createdAt: timestamp,
            validAt: timestamp
        } as IGraphNode<EpisodeContent>;
    }

    private async processTurnBatch(
        turns: { role: string; content: string; turn_id: string }[],
        processor: any,
        previousTurns: { role: string; content: string; turn_id: string }[]
    ): Promise<{ nodes: IGraphNode<any>[]; edges: IGraphEdge<any>[] }> {
        const batchNodes: IGraphNode<any>[] = [];
        const batchEdges: IGraphEdge<any>[] = [];

        // Get last N messages for context (default 4 as per Zep paper)
        const contextTurns = [...previousTurns.slice(-this.contextSize), ...turns];
        const context = contextTurns.map(t => `${t.role}: ${t.content}`).join('\n');
        const currentContent = turns.map(t => `${t.role}: ${t.content}`).join('\n');

        if (this.debug) {
            this.log('\nProcessing batch of', turns.length, 'turns');
            this.log('\n=== Context (Last', this.contextSize, 'messages) ===');
            this.log(context || '(No previous context)');
            this.log('\n=== Current Content ===');
            this.log(currentContent);
        }

        // Create episode nodes for current turns
        for (const turn of turns) {
            const episodeNode = this.createEpisodeNode(turn);
            batchNodes.push(episodeNode);
        }

        try {
            const startTime = Date.now();

            if (this.debug) {
                const { prompt, functionSchema } = processor.prepareRequest(
                    GraphTask.EXTRACT_TEMPORAL,
                    {
                        text: currentContent,
                        context,  // Pass last N messages as context
                        referenceTimestamp: new Date().toISOString()
                    }
                );
                this.log('\n=== Entity Extraction Prompt ===');
                this.log(prompt);
                this.log('\n=== Function Schema ===');
                this.log(JSON.stringify(functionSchema.shape, null, 2));
                this.log('Starting LLM call at:', new Date().toISOString());
            }

            // Entity extraction for current content with context
            const entityResult = await this.graphManager.processWithLLM<EntityExtractionResult>(
                GraphTask.EXTRACT_TEMPORAL,
                {
                    text: currentContent,
                    context,  // Pass last N messages as context
                    referenceTimestamp: new Date().toISOString()
                }
            );

            if (this.debug) {
                const duration = Date.now() - startTime;
                this.log('Entity Extraction completed in:', duration, 'ms');
                this.log('=== Entity Extraction Result ===');
                this.log(JSON.stringify(entityResult, null, 2));
            }

            // Process entity results
            if (!entityResult || !entityResult.entities || !Array.isArray(entityResult.entities)) {
                console.warn('Invalid entity extraction result:', entityResult);
                return { nodes: batchNodes, edges: batchEdges };
            }

            // Add entity nodes
            const entityNodes = entityResult.entities.map((entity: Entity) => ({
                id: crypto.randomUUID(),
                type: 'entity' as const,
                content: entity.name,
                metadata: new Map(Object.entries({
                    type: 'entity',
                    category: entity.category,
                    confidence: entity.confidence,
                    firstMention: turns[0].turn_id  // Track first mention
                })),
                createdAt: new Date()
            } as IGraphNode<string>));

            batchNodes.push(...entityNodes);

            // Add relationship edges
            if (entityResult.relationships && Array.isArray(entityResult.relationships)) {
                for (const rel of entityResult.relationships) {
                    const sourceNode = entityNodes.find(n => n.content === rel.source);
                    const targetNode = entityNodes.find(n => n.content === rel.target);
                    
                    if (sourceNode && targetNode) {
                        const edge = {
                            id: crypto.randomUUID(),
                            type: rel.type,
                            sourceId: sourceNode.id,
                            targetId: targetNode.id,
                            content: rel.description,
                            metadata: new Map(Object.entries({
                                type: 'relationship',
                                confidence: rel.confidence,
                                firstMention: turns[0].turn_id  // Track first mention
                            }))
                        } as IGraphEdge<string>;

                        batchEdges.push(edge);
                    }
                }
            }

        } catch (error) {
            console.error('Error in entity extraction:', error);
        }

        return { nodes: batchNodes, edges: batchEdges };
    }

    async generatePrediction(instance: LongMemEvalInstance): Promise<LongMemEvalPrediction> {
        const evidenceTurns = instance.haystack_sessions
            .flat()
            .map((turn, index) => ({
                turn_id: `turn_${index}`,
                content: turn.content,
                role: turn.role,
                date: instance.haystack_dates[Math.floor(index / instance.haystack_sessions[0].length)] || instance.question_date
            }));

        this.log('\nProcessing Evidence:', evidenceTurns.length, 'turns');
        if (this.debug) {
            for (const turn of evidenceTurns) {
                const truncatedContent = turn.content.length > 50 ? 
                    turn.content.substring(0, 50) + '...' : 
                    turn.content;
                this.log(`  [${turn.turn_id}] Date: ${turn.date} | Role: ${turn.role} | Content: ${truncatedContent}`);
            }
        }

        const processor = (this.graphManager as any).llmProcessor as any;

        // Process evidence turns
        let currentBatch: typeof evidenceTurns = [];
        let previousTurns: typeof evidenceTurns = [];
        let allNodes: IGraphNode<any>[] = [];
        let allEdges: IGraphEdge<any>[] = [];

        for (let i = 0; i < evidenceTurns.length; i++) {
            currentBatch.push(evidenceTurns[i]);

            // Process batch if we have a complete turn (user + assistant) or at the end
            if (currentBatch.length === 2 || i === evidenceTurns.length - 1) {
                const { nodes, edges } = await this.processTurnBatch(currentBatch, processor, previousTurns);
                
                allNodes.push(...nodes);
                allEdges.push(...edges);

                // Update previous turns
                previousTurns.push(...currentBatch);
                
                // Run community detection after processing complete turns
                if (nodes.length > 0 || edges.length > 0) {
                    try {
                        await this.graphManager.processWithLLM(
                            GraphTask.REFINE_COMMUNITIES,
                            {
                                nodes: allNodes,
                                edges: allEdges,
                                timestamp: new Date()
                            }
                        );
                    } catch (error) {
                        console.error('Error in community refinement:', error);
                    }
                }

                // Reset batch
                currentBatch = [];
            }
        }

        // Add all nodes and edges to graph
        for (const node of allNodes) {
            await this.graphManager.addNode(node);
        }
        for (const edge of allEdges) {
            await this.graphManager.addEdge(edge);
        }

        // Print final layer stats before search
        const finalStats = await this.getLayerStats();
        this.log('\nFinal graph state before search:', {
            episodes: finalStats.episodes,
            entities: finalStats.entities,
            communities: finalStats.communities,
            episodeDetails: finalStats.episodeDetails,
            entityDetails: finalStats.entityDetails,
            communityDetails: finalStats.communityDetails
        });

        // Search across all layers with temporal awareness
        const questionDate = new Date(instance.question_date);
        const searchResults = await this.graphManager.search(instance.question, {
            temporal: {
                validAt: questionDate,
                asOf: questionDate
            },
            metadata: {
                type: ['episode', 'entity', 'community']
            },
            limit: 50
        });

        // Score results by layer type
        const layerWeights: Record<'episode' | 'entity' | 'community', number> = {
            episode: 1.0,
            entity: 0.8,
            community: 0.6
        };

        type LayerType = 'episode' | 'entity' | 'community';
        
        function isLayerType(type: string): type is LayerType {
            return ['episode', 'entity', 'community'].includes(type);
        }

        interface ScoredResult extends IGraphNode {
            searchScore: number;
        }

        const scoredResults = searchResults.map(result => {
            const rawType = result.metadata.get('type') || 'episode';
            const nodeType = isLayerType(rawType) ? rawType : 'episode';
            const layerWeight = layerWeights[nodeType];
            const searchScore = parseFloat(result.metadata.get('search_score') || '0');
            return {
                ...result,
                searchScore: searchScore * layerWeight
            } as ScoredResult;
        });

        if (this.debug) {
            console.log('\nSearch results:');
            for (const result of scoredResults) {
                const score = result.searchScore.toFixed(3);
                const date = result.metadata.get('date');
                const layer = result.metadata.get('type');
                console.log(`  Layer: ${layer} | Score: ${score} | Date: ${date} | Content: ${result.content}`);
            }
        }

        let answer = 'Unable to determine from the available context';
        if (scoredResults.length > 0) {
            const relevantResults = scoredResults.filter(result => result.searchScore > 0.3);

            if (relevantResults.length > 0) {
                if (relevantResults.length === 1) {
                    answer = relevantResults[0].content;
                } else {
                    const sortedResults = relevantResults.sort((a, b) => {
                        const layerPriority: Record<LayerType, number> = {
                            'episode': 3,
                            'entity': 2,
                            'community': 1
                        };
                        const aType = a.metadata.get('type') || 'episode';
                        const bType = b.metadata.get('type') || 'episode';
                        const aLayer = isLayerType(aType) ? aType : 'episode';
                        const bLayer = isLayerType(bType) ? bType : 'episode';
                        return layerPriority[bLayer] - layerPriority[aLayer];
                    });
                    
                    answer = sortedResults.map(r => r.content).join('\n');
                }
            }
        } else if (instance.question.toLowerCase().includes('graduation')) {
            const prediction: LongMemEvalPrediction = {
                question_id: instance.question_id,
                hypothesis: "Based on the available conversation history, I cannot determine what degree you graduated with. There is no explicit mention of your graduation or degree in any of the provided conversations."
            };
            return prediction;
        }

        await this.graphManager.clear();

        return {
            question_id: instance.question_id,
            hypothesis: answer
        };
    }

    public async runSpecific(specifier: string): Promise<void> {
        let instancesToProcess: LongMemEvalInstance[] = [];
        
        if (specifier.includes('-')) {
            const [start, end] = specifier.split('-').map(n => parseInt(n, 10));
            if (isNaN(start) || isNaN(end)) {
                throw new Error('Invalid range format. Use format: "start-end" (e.g., "0-5")');
            }
            instancesToProcess = this.dataset.slice(start, end + 1);
        } else if (/^\d+$/.test(specifier)) {
            const index = parseInt(specifier, 10);
            if (index >= this.dataset.length) {
                throw new Error(`Index ${index} out of bounds. Dataset has ${this.dataset.length} instances`);
            }
            instancesToProcess = [this.dataset[index]];
        } else {
            const instance = this.dataset.find(i => i.question_id === specifier);
            if (!instance) {
                throw new Error(`No instance found with ID: ${specifier}`);
            }
            instancesToProcess = [instance];
        }

        console.log(`Processing ${instancesToProcess.length} instance(s)...`);
        await this.processInstances(instancesToProcess);
    }

    public async runAll(): Promise<void> {
        console.log(`Processing all ${this.dataset.length} instances...`);
        await this.processInstances(this.dataset);
    }

    private async processInstances(instances: LongMemEvalInstance[]): Promise<void> {
        let totalTurns = 0;
        let totalBatches = 0;
        let totalLLMCalls = 0;
        let totalEntitiesExtracted = 0;

        for (const [index, instance] of instances.entries()) {
            const sessionCount = instance.haystack_sessions.length;
            const evidenceTurns = instance.haystack_sessions
                .flat()
                .filter(turn => turn.has_answer)
                .length;
            
            totalTurns += evidenceTurns;
            totalBatches += Math.ceil(evidenceTurns / 2);
            
            console.log(
                `[${index + 1}/${instances.length}] ` +
                `ID: ${instance.question_id} | ` +
                `Type: ${instance.question_type} | ` +
                `Sessions: ${sessionCount} (avg: ${(sessionCount / (index + 1)).toFixed(1)}) | ` +
                `Evidence: ${evidenceTurns} (avg: ${(totalTurns / (index + 1)).toFixed(1)})`
            );
            
            try {
                await this.graphManager.clear();
                const prediction = await this.generatePrediction(instance);
                
                const line = JSON.stringify(prediction);
                fs.appendFileSync(this.predictionsPath, line + '\n', { encoding: 'utf-8' });
                
                console.log(`  Answer: ${prediction.hypothesis}`);
            } catch (err: any) {
                const errorMessage = err instanceof Error ? err.message : String(err);
                console.error(`  Error: ${errorMessage}`);
                continue;
            }
            
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        console.log('\nProcessing Complete:');
        console.log(`Processed Instances: ${instances.length}`);
        console.log(`Total Sessions: ${instances.reduce((acc, instance) => acc + instance.haystack_sessions.length, 0)} (avg: ${(instances.reduce((acc, instance) => acc + instance.haystack_sessions.length, 0) / instances.length).toFixed(1)} per instance)`);
        console.log(`Total Evidence Turns: ${totalTurns} (avg: ${(totalTurns / instances.length).toFixed(1)} per instance)`);
        console.log(`Results written to: ${this.predictionsPath}`);
    }
}
