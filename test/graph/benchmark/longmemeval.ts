import { GraphManager } from '../../../src/core/memory/graph/GraphManager';
import { GraphConfig, GraphTask } from '../../../src/core/memory/graph/types';
import { GraphFilter } from '../../../src/core/memory/graph/data/types';
import { LLMConfig } from '../../../src/core/memory/graph/types';
import { IGraphNode } from '../../../src/core/memory/graph/data/types';
import { OpenAI } from "openai";
import { TemporalSearchResult } from '../../../src/core/memory/graph/query/hybrid';
import * as fs from 'fs';
import { readFileSync } from 'fs';

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
}

interface LongMemEvalPrediction {
    question_id: string;
    hypothesis: string;
}

export class LongMemEvalRunner {
    private dataset: LongMemEvalInstance[];
    private graphManager: GraphManager;
    private predictionsPath: string;
    private llmConfig: LLMConfig;
    private openai: OpenAI;
    private llmProcessor: any; // Assuming this is defined elsewhere

    constructor(
        datasetPath: string, 
        predictionsPath: string, 
        graphConfig: GraphConfig,
        llmConfig: LLMConfig
    ) {
        // Add default search config if not provided
        const configWithSearch: GraphConfig = {
            ...graphConfig,
            search: graphConfig.search || {
                textWeight: 0.4,
                embeddingWeight: 0.6,
                minTextScore: 0.1,
                minEmbeddingScore: 0.5,
                limit: 10
            }
        };
        this.graphManager = new GraphManager(configWithSearch);
        this.llmConfig = llmConfig;
        this.openai = new OpenAI({
            apiKey: llmConfig.apiKey,
            baseURL: llmConfig.baseURL
        });
        this.dataset = this.loadDataset(datasetPath);
        this.predictionsPath = predictionsPath;
    }

    private loadDataset(path: string): LongMemEvalInstance[] {
        const content = readFileSync(path, 'utf-8');
        return JSON.parse(content);
    }

    async generatePrediction(instance: LongMemEvalInstance): Promise<LongMemEvalPrediction> {
        try {
            console.log('\n=== Processing Chat History ===');
            // Process each session and add to graph
            for (const [sessionIndex, session] of instance.haystack_sessions.entries()) {
                console.log(`\nSession ${sessionIndex + 1}/${instance.haystack_sessions.length}`);
                console.log(`Date: ${instance.haystack_dates[sessionIndex]}`);
                console.log(`ID: ${instance.haystack_session_ids[sessionIndex]}`);
                
                let sessionContent = '';
                for (const [turnIndex, turn] of session.entries()) {
                    console.log(`  Turn ${turnIndex + 1}: ${turn.role} ${turn.has_answer ? '[EVIDENCE]' : ''}`);
                    sessionContent += `${turn.role}: ${turn.content}\n`;
                }
                
                // Create node with required IGraphNode properties
                const node: IGraphNode<string> = {
                    id: instance.haystack_session_ids[sessionIndex],
                    type: 'session',
                    content: sessionContent,
                    metadata: new Map([
                        ['date', instance.haystack_dates[sessionIndex]],
                        ['has_evidence', session.some(turn => turn.has_answer).toString()]
                    ]),
                    createdAt: new Date(instance.haystack_dates[sessionIndex]),
                    validAt: new Date(instance.haystack_dates[sessionIndex])
                };
                
                const nodeId = await this.graphManager.addNode(node);
                console.log(`  Added to graph with node ID: ${nodeId}`);
            }

            console.log('\n=== Graph Search ===');
            console.log('Query:', instance.question);
            console.log('Question Date:', instance.question_date);
            
            // Search for relevant nodes using standard search
            const searchResults = await this.graphManager.search(instance.question);
            const results = searchResults.map(node => ({
                id: node.id,
                score: node.metadata.get('search_score') || 0,
                confidence: node.metadata.get('search_confidence') || 0,
                timestamp: node.validAt || node.createdAt
            }));
            
            console.log(`\nFound ${results.length} relevant nodes:`);
            for (const result of results) {
                console.log(`- Node ${result.id} (score: ${result.score.toFixed(3)}, confidence: ${result.confidence.toFixed(3)})`);
            }
            
            // Get full nodes from search results
            const relevantNodes = searchResults;
            
            console.log('\n=== Evaluating Search Results ===');
            // First evaluate search results
            const evaluations = await Promise.all(
                relevantNodes.filter((node): node is IGraphNode<string> => node !== null)
                .map(async (node) => {
                    const evaluation = await this.graphManager.processWithLLM<{
                        relevance: number;
                        confidence: number;
                        reason: string;
                    }>(GraphTask.EVALUATE_SEARCH, {
                        query: instance.question,
                        result: node.content
                    });
                    console.log(`\nEvaluating node ${node.id}:`);
                    console.log(`- Relevance: ${evaluation.relevance.toFixed(3)}`);
                    console.log(`- Confidence: ${evaluation.confidence.toFixed(3)}`);
                    console.log(`- Reason: ${evaluation.reason}`);
                    return { node, evaluation };
                })
            );
            
            console.log('\n=== Filtered Context ===');
            // Filter and sort by relevance
            const relevantContext = evaluations
                .filter(({ evaluation, node }) => {
                    const isRelevant = evaluation.relevance > 0.7;
                    console.log(`Node ${node.id}: ${isRelevant ? 'INCLUDED' : 'FILTERED OUT'} (relevance: ${evaluation.relevance.toFixed(3)})`);
                    return isRelevant;
                })
                .sort((a, b) => b.evaluation.relevance - a.evaluation.relevance)
                .map(({ node }) => node.content)
                .join('\n\n');
            
            console.log('\n=== Generating Final Answer ===');
            // Generate final answer using relevant context
            const prompt = `Based on the following context, answer the question. Provide ONLY the final answer without any explanation or thinking process.

Question: ${instance.question}

Context:
${relevantContext}

Answer the question concisely based only on the information provided in the context. If the answer cannot be determined from the context, respond with exactly "Unable to determine from the available context."`;
            
            const completion = await this.openai.chat.completions.create({
                model: this.llmConfig.model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7,
                max_tokens: 150
            });
            
            // Clean up the response to remove any thinking process
            let hypothesis = completion.choices[0].message.content?.trim() || 'Unable to determine from the available context';
            
            // Ensure we're using the standard format for "unable to determine"
            if (hypothesis.toLowerCase().includes('unable to determine') || 
                hypothesis.toLowerCase().includes('cannot determine') ||
                hypothesis.toLowerCase().includes('not enough information')) {
                hypothesis = 'Unable to determine from the available context';
            }
            
            console.log('\nFinal Answer:', hypothesis);
            
            return {
                question_id: instance.question_id,
                hypothesis
            };
            
        } catch (error) {
            console.error('Error generating prediction:', error);
            throw error;
        }
    }

    public async runAll(): Promise<void> {
        const predictions: LongMemEvalPrediction[] = [];
        
        console.log(`Processing ${this.dataset.length} instances...`);
        
        // Process only first instance for testing
        const instancesToProcess = this.dataset.slice(0, 1);
        
        // Clear the predictions file before starting
        fs.writeFileSync(this.predictionsPath, '', { encoding: 'utf-8' });
        
        for (const [index, instance] of instancesToProcess.entries()) {
            console.log(`\nProcessing instance ${index + 1}/${instancesToProcess.length}`);
            console.log(`Question ID: ${instance.question_id}`);
            console.log(`Question Type: ${instance.question_type}`);
            console.log(`Question: ${instance.question}`);
            
            try {
                // Clear previous graph data
                await this.graphManager.clear();
                
                // Generate prediction for this instance
                const prediction = await this.generatePrediction(instance);
                predictions.push(prediction);
                
                // Write prediction to file immediately in JSONL format (one JSON object per line)
                fs.writeFileSync(
                    this.predictionsPath,
                    JSON.stringify(prediction) + '\n',
                    { flag: 'a', encoding: 'utf-8' }
                );
            } catch (error) {
                console.error(`Error processing instance ${instance.question_id}:`, error);
                // Even if there's an error, output a prediction to maintain the format
                const errorPrediction: LongMemEvalPrediction = {
                    question_id: instance.question_id,
                    hypothesis: 'Unable to determine from the available context'
                };
                predictions.push(errorPrediction);
                fs.writeFileSync(
                    this.predictionsPath,
                    JSON.stringify(errorPrediction) + '\n',
                    { flag: 'a', encoding: 'utf-8' }
                );
            }
            
            // Add a small delay between instances to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        console.log(`\nCompleted processing test instance. Results written to: ${this.predictionsPath}`);
    }
}
