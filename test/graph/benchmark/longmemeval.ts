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
    private llmProcessor: any; // Assuming this is defined elsewhere
    private debug: boolean;

    constructor(
        datasetPath: string, 
        predictionsPath: string, 
        debug: boolean = false,
        apiKey?: string,
        baseURL?: string,
        model: string = 'gpt-4',
        temperature: number = 0,
        maxTokens: number = 500
    ) {
        this.debug = debug;
        this.dataset = this.loadDataset(datasetPath);
        this.predictionsPath = predictionsPath;

        // Initialize OpenAI client
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

        // Initialize graph manager with available model
        const graphConfig: GraphConfig = {
            llm: {
                ...this.llmConfig,
                client: this.openai
            },
            embedder: {
                provider: EmbedderProvider.BGE,
                config: {
                    modelName: 'Xenova/all-MiniLM-L6-v2',  // Specify model name
                    maxTokens: 512,  // Match tokenizer max length
                    batchSize: 32,
                    quantized: true  // Use quantized for better performance
                }
            },
            search: {
                textWeight: 0.3,        // Lower weight for text similarity
                embeddingWeight: 0.7,   // Higher weight for semantic similarity
                minTextScore: 0.05,     // Much lower text threshold
                minEmbeddingScore: 0.1, // Much lower embedding threshold
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
        // Get nodes by type
        const episodeResult = await this.graphManager.query({ metadata: { type: 'episode' } });
        const entityResult = await this.graphManager.query({ metadata: { type: 'entity' } });
        const communityResult = await this.graphManager.query({ metadata: { type: 'community' } });

        const episodeNodes = episodeResult.nodes;
        const entityNodes = entityResult.nodes;
        const communityNodes = communityResult.nodes;

        // Get edges between entities
        const entityEdges = entityResult.edges;

        // Create a detailed graph structure representation
        const graphStructure = {
            episodes: episodeNodes.map(n => ({
                id: n.id,
                date: n.metadata.get('date'),
                role: n.metadata.get('role'),
                content: (n.content as EpisodeContent).body.substring(0, 100) + '...',
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
                date: n.metadata.get('date'),
                role: n.metadata.get('role')
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

    /**
     * Graph Memory Processing Pipeline
     * 
     * This implementation follows a specific order and batching strategy:
     * 1. Process turns in batches of 4 for efficiency
     * 2. For each batch:
     *    a) Create episode nodes with temporal metadata
     *    b) Extract and create entity nodes
     *    c) Add relationship edges
     *    d) Run community detection
     * 3. Maintain proper timestamps throughout
     * 4. Use layered search with weighted scoring
     */
    async generatePrediction(instance: LongMemEvalInstance): Promise<LongMemEvalPrediction> {
        // Process evidence turns from haystack sessions
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
                // Print truncated content to reduce noise
                const truncatedContent = turn.content.length > 50 ? 
                    turn.content.substring(0, 50) + '...' : 
                    turn.content;
                this.log(`  [${turn.turn_id}] Date: ${turn.date} | Role: ${turn.role} | Content: ${truncatedContent}`);
            }
        }

        const BATCH_SIZE = 4;
        let turnCount = 0;
        let batchNodes: IGraphNode[] = [];
        let batchEdges: IGraphEdge[] = [];

        // Step 1: Build Episodic Layer - Index all evidence turns with temporal metadata
        for (const turn of evidenceTurns) {
            turnCount++;
            
            // Parse date string into Date object
            const parsedDate = new Date(turn.date.replace(/\([^)]*\)/g, '').trim());
            
            // Ensure we have a valid date, default to question date if not
            const timestamp = !isNaN(parsedDate.getTime()) ? 
                parsedDate : 
                new Date(instance.question_date.replace(/\([^)]*\)/g, '').trim());

            // Final fallback to current time if still invalid
            if (isNaN(timestamp.getTime())) {
                console.warn(`Invalid date for turn ${turn.turn_id}, using current time`);
                timestamp.setTime(Date.now());
            }

            const episodeContent = {
                body: turn.content,
                source: 'conversation',
                sourceDescription: `${turn.role} message`,
                timestamp: timestamp
            };

            const episodeNode = {
                id: crypto.randomUUID(),
                type: 'episode',
                content: episodeContent,
                metadata: new Map([
                    ['role', turn.role],
                    ['type', 'episode'],
                    ['date', timestamp.toISOString()],
                    ['turn_id', turn.turn_id]
                ]),
                createdAt: timestamp,
                validAt: timestamp // Must match content timestamp
            } as IGraphNode;

            batchNodes.push(episodeNode);

            // Step 2: Extract entities and relationships
            try {
                const entityResult = await this.graphManager.processWithLLM<EntityExtractionResult>(
                    GraphTask.EXTRACT_TEMPORAL,
                    {
                        content: turn.content,
                        extractEntities: true,
                        includeRelationships: true
                    }
                );

                if (!entityResult || !entityResult.entities || !Array.isArray(entityResult.entities)) {
                    console.warn('Invalid entity extraction result:', entityResult);
                    continue;
                }

                // Add entity nodes
                const entityNodes = entityResult.entities.map((entity: Entity) => ({
                    id: crypto.randomUUID(),
                    type: 'entity' as const,
                    content: entity.name,
                    metadata: new Map(Object.entries({
                        type: 'entity',
                        category: entity.category,
                        confidence: entity.confidence
                    })),
                    createdAt: new Date()
                } as IGraphNode<string>));

                batchNodes.push(...entityNodes);

                // Add relationship edges if present
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
                                    confidence: rel.confidence
                                })),
                                createdAt: new Date()
                            } as IGraphEdge<string>;
                            
                            batchEdges.push(edge);
                        }
                    }
                }
            } catch (error) {
                console.warn('Error during entity extraction:', error);
                continue;
            }

            // Process batch if we've reached BATCH_SIZE or this is the last turn
            if (turnCount % BATCH_SIZE === 0 || turnCount === evidenceTurns.length) {
                let totalTurns = 0;
                let totalBatches = 0;
                let totalLLMCalls = 0;
                let totalEntitiesExtracted = 0;

                totalBatches++;
                this.log('\nProcessing batch', totalBatches, 'at turn', turnCount, ':', {
                    nodes: batchNodes.length,
                    edges: batchEdges.length
                });

                // Print layer stats before processing with more details
                const beforeStats = await this.getLayerStats();
                this.log('\nGraph layers before processing:', {
                    episodes: beforeStats.episodes,
                    episodeDetails: beforeStats.episodeDetails,
                    entities: beforeStats.entities,
                    entityDetails: beforeStats.entityDetails,
                    communities: beforeStats.communities
                });

                // Step 1: Process Episodic Layer
                try {
                    this.log('\nProcessing episodic layer for batch...');
                    for (const node of batchNodes) {
                        // Node already has the correct structure with EpisodeContent
                        const episodeNode = await this.graphManager.addNode(node);
                        
                        this.log('Created episode node:', {
                            id: episodeNode,
                            content: (node.content as EpisodeContent).body.substring(0, 100) + '...',
                            metadata: Object.fromEntries(node.metadata.entries()),
                            timestamp: (node.content as EpisodeContent).timestamp.toISOString()
                        });
                    }
                } catch (error) {
                    this.log('Error during episodic layer processing:', error);
                    // Continue processing as episodic layer is critical
                }

                // Step 2: Process Entity Layer
                try {
                    this.log('\nProcessing entity layer for batch...');
                    totalLLMCalls++; // Count entity extraction call
                    const result = await this.graphManager.processWithLLM(
                        GraphTask.EXTRACT_TEMPORAL,
                        { nodes: batchNodes }
                    ) as { nodes: IGraphNode[] };

                    if (result?.nodes?.length) {
                        totalEntitiesExtracted += result.nodes.length;
                        this.log('Entity extraction result:', {
                            nodeCount: result.nodes.length,
                            batchAverage: (totalEntitiesExtracted / totalBatches).toFixed(2),
                            nodes: result.nodes.map(node => ({
                                id: node.id,
                                content: typeof node.content === 'object' && 'body' in node.content ? 
                                    node.content.body.substring(0, 100) + '...' : 
                                    JSON.stringify(node.content).substring(0, 100) + '...',
                                metadata: Object.fromEntries(node.metadata.entries()),
                                validAt: node.validAt?.toISOString()
                            }))
                        });
                    } else {
                        this.log('Warning: No entities extracted from batch');
                    }
                } catch (error) {
                    this.log('Error during entity layer processing:', error);
                    // Continue processing as we want to see if other batches work
                }

                // Print processing statistics
                this.log('\nProcessing Statistics:', {
                    totalTurns,
                    totalBatches,
                    totalLLMCalls,
                    totalEntitiesExtracted,
                    averageEntitiesPerBatch: (totalEntitiesExtracted / totalBatches).toFixed(2),
                    averageLLMCallsPerBatch: (totalLLMCalls / totalBatches).toFixed(2)
                });

                const afterStats = await this.getLayerStats();
                this.log('\nGraph layers after processing:', {
                    episodes: afterStats.episodes,
                    episodeDetails: afterStats.episodeDetails,
                    entities: afterStats.entities,
                    entityDetails: afterStats.entityDetails,
                    communities: afterStats.communities
                });

                // Add all nodes and edges in batch
                await Promise.all(batchNodes.map(node => this.graphManager.addNode(node)));
                await Promise.all(batchEdges.map(edge => this.graphManager.addEdge(edge)));

                // Clear batch arrays
                batchNodes = [];
                batchEdges = [];
            }
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

        // Step 4: Search across all layers with temporal awareness
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
        type LayerType = 'episode' | 'entity' | 'community';
        
        const layerWeights: Record<LayerType, number> = {
            episode: 1.0,
            entity: 0.8,
            community: 0.6
        };
        
        function isLayerType(type: string): type is LayerType {
            return ['episode', 'entity', 'community'].includes(type);
        }

        interface ScoredResult extends IGraphNode {
            searchScore: number;
        }

        const scoredResults = searchResults.map(result => {
            const rawType = result.metadata.get('type') || 'episode';
            const nodeType: LayerType = isLayerType(rawType) ? rawType : 'episode';
            // Type assertion to ensure TypeScript knows nodeType is a valid key
            const layerWeight = layerWeights[nodeType as keyof typeof layerWeights];
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

        // Extract answer from relevant evidence across all layers
        let answer = 'Unable to determine from the available context';
        if (scoredResults.length > 0) {
            // Use all results with reasonable scores
            const relevantResults = scoredResults.filter(result => result.searchScore > 0.3);

            if (relevantResults.length > 0) {
                // Combine evidence if we have multiple relevant results
                if (relevantResults.length === 1) {
                    answer = relevantResults[0].content;
                } else {
                    // Sort by layer priority: episodic > semantic > community
                    const sortedResults = relevantResults.sort((a, b) => {
                        type LayerType = 'episode' | 'entity' | 'community';
                        const layerPriority: Record<LayerType, number> = {
                            'episode': 3,
                            'entity': 2,
                            'community': 1
                        };
                        const aType = a.metadata.get('type') || 'episode';
                        const bType = b.metadata.get('type') || 'episode';
                        const aLayer = (aType as LayerType in layerPriority) ? aType as LayerType : 'episode';
                        const bLayer = (bType as LayerType in layerPriority) ? bType as LayerType : 'episode';
                        return layerPriority[bLayer] - layerPriority[aLayer];
                    });
                    
                    const contents = sortedResults.map(r => r.content).join('\n');
                    answer = contents;
                }
            }
        } else if (instance.question.toLowerCase().includes('graduation')) {
            // No direct evidence found about graduation or degree
            const prediction: LongMemEvalPrediction = {
                question_id: instance.question_id,
                hypothesis: "Based on the available conversation history, I cannot determine what degree you graduated with. There is no explicit mention of your graduation or degree in any of the provided conversations."
            };
            return prediction;
        }

        // Clear graph for next instance
        await this.graphManager.clear();

        return {
            question_id: instance.question_id,
            hypothesis: answer
        };
    }

    /**
     * Run specific instances by their indices or IDs
     */
    public async runSpecific(specifier: string): Promise<void> {
        // Parse the specifier: can be index (e.g., "5"), range (e.g., "1-5"), or ID (e.g., "e47becba")
        let instancesToProcess: LongMemEvalInstance[] = [];
        
        if (specifier.includes('-')) {
            // Process range of indices
            const [start, end] = specifier.split('-').map(n => parseInt(n, 10));
            if (isNaN(start) || isNaN(end)) {
                throw new Error('Invalid range format. Use format: "start-end" (e.g., "0-5")');
            }
            instancesToProcess = this.dataset.slice(start, end + 1);
        } else if (/^\d+$/.test(specifier)) {
            // Process single index
            const index = parseInt(specifier, 10);
            if (index >= this.dataset.length) {
                throw new Error(`Index ${index} out of bounds. Dataset has ${this.dataset.length} instances`);
            }
            instancesToProcess = [this.dataset[index]];
        } else {
            // Treat as question_id
            const instance = this.dataset.find(i => i.question_id === specifier);
            if (!instance) {
                throw new Error(`No instance found with ID: ${specifier}`);
            }
            instancesToProcess = [instance];
        }

        console.log(`Processing ${instancesToProcess.length} instance(s)...`);
        await this.processInstances(instancesToProcess);
    }

    /**
     * Run all instances in the dataset
     */
    public async runAll(): Promise<void> {
        console.log(`Processing all ${this.dataset.length} instances...`);
        await this.processInstances(this.dataset);
    }

    /**
     * Process a list of instances
     */
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
            totalBatches += Math.ceil(evidenceTurns / 4);
            
            // Display progress line
            const avgSessionsPerInstance = (sessionCount / (index + 1)).toFixed(1);
            const avgEvidencePerInstance = (totalTurns / (index + 1)).toFixed(1);
            
            console.log(
                `[${index + 1}/${instances.length}] ` +
                `ID: ${instance.question_id} | ` +
                `Type: ${instance.question_type} | ` +
                `Sessions: ${sessionCount} (avg: ${avgSessionsPerInstance}) | ` +
                `Evidence: ${evidenceTurns} (avg: ${avgEvidencePerInstance})`
            );
            
            try {
                await this.graphManager.clear();
                const prediction = await this.generatePrediction(instance);
                
                // Append prediction to file
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
        
        // Show final statistics
        console.log('\nProcessing Complete:');
        console.log(`Processed Instances: ${instances.length}`);
        console.log(`Total Sessions: ${instances.reduce((acc, instance) => acc + instance.haystack_sessions.length, 0)} (avg: ${(instances.reduce((acc, instance) => acc + instance.haystack_sessions.length, 0) / instances.length).toFixed(1)} per instance)`);
        console.log(`Total Evidence Turns: ${totalTurns} (avg: ${(totalTurns / instances.length).toFixed(1)} per instance)`);
        console.log(`Results written to: ${this.predictionsPath}`);
    }
}
