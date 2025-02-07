import { GraphManager, SearchOptions, SearchResult } from '../../../src/core/memory/graph/GraphManager';
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

interface Turn {
    role: string;
    content: string;
    turn_id: string;
    date?: string;
}

export class LongMemEvalRunner {
    private graphManager: GraphManager;
    private llmConfig: LLMConfig;
    private openai: OpenAI;
    private dataset: LongMemEvalInstance[];
    private predictionsPath: string;
    private debug: boolean;
    private contextSize: number;
    private batchSize: number;
    private stats: {
        batchesProcessed: number;
        entityExtractionCalls: number;
        communityRefinementCalls: number;
        entityExtractionTime: number;
        communityRefinementTime: number;
        totalEntitiesExtracted: number;
        totalRelationshipsExtracted: number;
    };

    constructor(
        datasetPath: string, 
        predictionsPath: string, 
        debug: boolean = false,
        apiKey?: string,
        baseURL?: string,
        model: string = 'gpt-4',
        temperature: number = 0,
        maxTokens: number = 500,
        contextSize: number = 4,  // Default to 4 messages (2 complete turns) for context as per Zep paper
        turns: number = 2  // Default to process 2 turns (4 messages) at a time
    ) {
        this.debug = debug;
        this.contextSize = 2;  // How many previous messages to use as context
        this.batchSize = turns * 2;   // Each turn consists of 2 messages (user + assistant)
        this.stats = {
            batchesProcessed: 0,
            entityExtractionCalls: 0,
            communityRefinementCalls: 0,
            entityExtractionTime: 0,
            communityRefinementTime: 0,
            totalEntitiesExtracted: 0,
            totalRelationshipsExtracted: 0
        };
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
        const result = await this.graphManager.search('', {
            filters: { nodeTypes: ['episode', 'entity', 'community'] }
        });

        const stats = {
            episodes: 0,
            entities: 0,
            communities: 0
        };

        for (const { node } of result) {
            const type = node.type;
            if (type === 'episode') stats.episodes++;
            else if (type === 'entity') stats.entities++;
            else if (type === 'community') stats.communities++;
        }

        return stats;
    }

    /**
     * Process a batch of turns
     */
    private async processTurnBatch(
        batch: Turn[],
        batchTimestamp: Date,
        sessionId: string
    ): Promise<void> {
        const batchStartTime = Date.now();
        this.stats.batchesProcessed++;
        
        if (this.debug) {
            this.log(`\nProcessing batch of ${batch.length} turns at ${batchTimestamp.toISOString()}`);
            this.log('\n=== Current Content ===');
            this.log(batch.map(t => `${t.role}: ${t.content}`).join('\n'));
        }

        const messages = batch.map(turn => ({
            id: turn.turn_id,
            body: turn.content,
            role: turn.role,
            timestamp: turn.date ? new Date(turn.date) : batchTimestamp,
            sessionId: sessionId
        }));

        await this.graphManager.ingest(messages);

        // Show all episode nodes after ingestion
        if (this.debug) {
            const { nodes: episodeNodes } = await this.graphManager.getSnapshot({ nodeTypes: ['episode'], sessionId: sessionId });
            this.log('\n=== All Episode Nodes ===');
            episodeNodes.forEach((node: IGraphNode) => {
                this.log(`Episode Node ${node.id}:`, node);
            });
        }

        const batchEndTime = Date.now();
        if (this.debug) {
            this.log(`\nBatch processing complete in ${batchEndTime - batchStartTime}ms`);
        }
    }

    /**
     * Search for relevant turns
     */
    async searchTurns(query: string, options?: SearchOptions): Promise<SearchResult[]> {
        return this.graphManager.search(query, {
            ...options,
            filters: {
                ...options?.filters,
                nodeTypes: ['episode']
            }
        });
    }

    /**
     * Log processing statistics
     */
    private logProcessingStats() {
        console.log('\nProcessing Statistics:');
        console.log('====================');
        console.log(`Total Batches Processed: ${this.stats.batchesProcessed}`);
        console.log('\nLLM Calls:');
        console.log(`- Entity Extraction: ${this.stats.entityExtractionCalls} calls`);
        console.log(`- Community Refinement: ${this.stats.communityRefinementCalls} calls`);
        console.log(`- Total LLM Calls: ${this.stats.entityExtractionCalls + this.stats.communityRefinementCalls} calls`);
        console.log('\nPerformance:');
        console.log(`- Entity Extraction Time: ${(this.stats.entityExtractionTime / 1000).toFixed(2)}s`);
        console.log(`- Community Refinement Time: ${(this.stats.communityRefinementTime / 1000).toFixed(2)}s`);
        console.log(`- Average Time per Entity Extraction: ${(this.stats.entityExtractionTime / this.stats.entityExtractionCalls / 1000).toFixed(2)}s`);
        console.log('\nExtraction Results:');
        console.log(`- Total Entities Extracted: ${this.stats.totalEntitiesExtracted}`);
        console.log(`- Total Relationships Extracted: ${this.stats.totalRelationshipsExtracted}`);
        console.log(`- Avg Entities per Batch: ${(this.stats.totalEntitiesExtracted / this.stats.batchesProcessed).toFixed(2)}`);
        console.log(`- Avg Relationships per Batch: ${(this.stats.totalRelationshipsExtracted / this.stats.batchesProcessed).toFixed(2)}`);
    }

    public async runSpecific(instance: string): Promise<void> {
        const jsonInstance = JSON.parse(instance);
        const question_id = jsonInstance.question_id;
        const sessions = jsonInstance.sessions;
        const turns = jsonInstance.turns;
        const target = this.dataset.find(i => i.question_id === question_id);
        if (!target) {
            throw new Error(`Instance with question_id ${question_id} not found`);
        }
        
        // Extract session range from the sessions string
        const [startSession, endSession] = sessions.split('-').map(Number);

        // Iterate through the specified session range
        for (let sessionIndex = startSession; sessionIndex <= endSession; sessionIndex++) {
            const session = target.haystack_sessions[sessionIndex];
            if (!session) {
                this.log(`Session ${sessionIndex} not found`);
                continue;
            }

            this.log(`Processing Session ${sessionIndex}: ${session.length} turns`);

            let turnIndex = 0;
            let currentBatch: Turn[] = [];
            let batchTimestamp: Date = new Date(target.question_date);

            for (const turn of session) {
                const turn_id = `turn_${sessionIndex}_${turnIndex}`;  // Create a unique turn_id
                const turnDate = target.haystack_dates[sessionIndex] || target.question_date;  // Use session date or question date

                currentBatch.push({
                    role: turn.role,
                    content: turn.content,
                    turn_id: turn_id,
                    date: turnDate
                });

                turnIndex++;

                // Process batch when it reaches the batch size or the end of the session
                if (currentBatch.length >= this.batchSize || turnIndex === session.length) {
                    if (currentBatch.length > 0) {
                        await this.processTurnBatch(
                            currentBatch,
                            batchTimestamp,
                            `session_${sessionIndex}`
                        );
                        this.log(`Processed batch of ${currentBatch.length} turns`);
                    }
                    currentBatch = [];  // Reset batch after processing
                }
            }
        }

        // Search across all layers with temporal awareness
        const questionDate = new Date(target.question_date);
        const searchResults = await this.searchTurns(target.question, {
            timestamp: questionDate,
            filters: {
                timeRange: [new Date(0), questionDate]
            }
        });

        // Format results for evaluation
        let answer = 'Unable to determine from the available context';
        
        if (searchResults.length > 0) {
            // Sort by score and confidence
            const relevantResults = searchResults
                .filter(r => r.score > 0.3)
                .sort((a, b) => b.score * b.confidence - a.score * a.confidence);

            if (relevantResults.length > 0) {
                const metadata = Object.fromEntries(relevantResults[0].node.metadata);
                answer = relevantResults[0].node.content as string;
            }
        }

        await this.graphManager.clear();

        // Write prediction to file
        const predictions = [{
            question_id: target.question_id,
            hypothesis: answer
        }];

        fs.writeFileSync(this.predictionsPath, JSON.stringify(predictions, null, 2));

        // Output results in a format similar to test/graph-eval.txt
        console.log('Question ID:', target.question_id);
        console.log('Question:', target.question);
        console.log('Answer:', target.answer);
        console.log('Hypothesis:', answer);
        console.log('Correct:', target.answer === answer);
        console.log('---');

        if (this.debug) {
            // Print graph snapshot
            const { nodes, edges } = await this.graphManager.getSnapshot({});
            this.log('\n=== Final Graph Snapshot ===');
            this.log('\nNodes:');
            nodes.forEach(node => {
                this.log(`[${node.type}] ${node.id}:`, {
                    content: node.content,
                    metadata: Object.fromEntries(node.metadata),
                    validAt: node.validAt
                });
            });
            this.log('\nEdges:');
            edges.forEach(edge => {
                this.log(`[${edge.type}] ${edge.sourceId} -> ${edge.targetId}:`, {
                    metadata: Object.fromEntries(edge.metadata),
                    validAt: edge.validAt
                });
            });
        }
    }

    public async generatePrediction(haystack_sessions: LongMemEvalTurn[][]): Promise<LongMemEvalPrediction> {
        throw new Error("Not implemented");
    }

    public async runAll(): Promise<void> {
        await this.processInstances(this.dataset);
    }

    private async processInstances(instances: LongMemEvalInstance[]): Promise<void> {
        const predictions: LongMemEvalPrediction[] = [];

        for (const instance of instances) {
            const target = instance;

            // Process sessions
            for (let sessionIndex = 0; sessionIndex < instance.haystack_sessions.length; sessionIndex++) {
                const session = instance.haystack_sessions[sessionIndex];
                this.log(`Processing Session ${sessionIndex}: ${session.length} turns`);

                let turnIndex = 0;
                let currentBatch: Turn[] = [];
                let batchTimestamp: Date = new Date(target.question_date);

                for (const turn of session) {
                    const turn_id = `turn_${sessionIndex}_${turnIndex}`;  // Create a unique turn_id
                    const turnDate = instance.haystack_dates[sessionIndex] || instance.question_date;  // Use session date or question date

                    currentBatch.push({
                        role: turn.role,
                        content: turn.content,
                        turn_id: turn_id,
                        date: turnDate
                    });

                    turnIndex++;

                    // Process batch when it reaches the batch size or the end of the session
                    if (currentBatch.length >= this.batchSize || turnIndex === session.length) {
                        if (currentBatch.length > 0) {
                            await this.processTurnBatch(
                                currentBatch,
                                batchTimestamp,
                                `session_${sessionIndex}`
                            );
                            this.log(`Processed batch of ${currentBatch.length} turns`);
                        }
                        currentBatch = [];  // Reset batch after processing
                    }
                }
            }

            // Search across all layers with temporal awareness
            const questionDate = new Date(target.question_date);
            const searchResults = await this.searchTurns(target.question, {
                timestamp: questionDate,
                filters: {
                    timeRange: [new Date(0), questionDate]
                }
            });

            // Format results for evaluation
            let answer = 'Unable to determine from the available context';
            
            if (searchResults.length > 0) {
                // Sort by score and confidence
                const relevantResults = searchResults
                    .filter(r => r.score > 0.3)
                    .sort((a, b) => b.score * b.confidence - a.score * a.confidence);

                if (relevantResults.length > 0) {
                    const metadata = Object.fromEntries(relevantResults[0].node.metadata);
                    answer = relevantResults[0].node.content as string;
                }
            }

            await this.graphManager.clear();

            // Write prediction to file
            const predictions = [{
                question_id: target.question_id,
                hypothesis: answer
            }];

            fs.writeFileSync(this.predictionsPath, JSON.stringify(predictions, null, 2));

            // Output results in a format similar to test/graph-eval.txt
            console.log('Question ID:', target.question_id);
            console.log('Question:', target.question);
            console.log('Answer:', target.answer);
            console.log('Hypothesis:', answer);
            console.log('Correct:', target.answer === answer);
            console.log('---');
        }

        // Write all predictions to file
        fs.writeFileSync(this.predictionsPath, JSON.stringify(predictions, null, 2));
    }
}
