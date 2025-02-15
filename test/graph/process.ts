import { Command } from 'commander';
import { GraphManager } from '../../src/core/memory/graph/GraphManager';
import { GraphConfig, LLMConfig, GraphTask, MessageEpisode } from '../../src/core/memory/graph/types';
import { DeterministicIdGenerator } from '../../src/core/memory/graph/id/DeterministicIdGenerator';
import { OpenAI } from 'openai';
import * as fs from 'fs/promises';
import path from 'path';

// Define types for our dataset structure
interface Message {
    role: string;
    content: string;
}

interface Turn {
    turn_id: string;
    messages: Message[];
}

interface Session {
    session_id: string;
    timestamp: string;
    turns: Turn[];
}

interface Dataset {
    conversations: Session[];
}

// Expand "~" to home directory in paths
function expandPath(inputPath: string): string {
    if (inputPath.startsWith('~/')) {
        const homePath = process.env.HOME || process.env.USERPROFILE || '';
        return path.join(homePath, inputPath.slice(2));
    }
    return inputPath;
}

const program = new Command();

program
    .name('process')
    .description('Process conversation dataset through GraphManager')
    .option('--dataset <path>', 'Path to dataset JSON file', './dataset/orwell-conversation.json')
    .option('--output <path>', 'Path to output directory for graph data', './dataset/output')
    .option('--base-url <url>', 'Base URL for OpenAI-compatible API')
    .option('--api-key <key>', 'API key for OpenAI-compatible API')
    .option('--model <n>', 'Model name to use for completions', 'gpt-4')
    .option('--temperature <n>', 'Temperature for completions', '0')
    .option('--max-tokens <n>', 'Maximum tokens for completions', '500')
    .option('--batch-size <n>', 'Number of messages to process in each batch', '4')
    .option('--layer <n>', 'Processing layer depth (1: episodic, 2: semantic, 3: community)', '3')
    .option('--debug', 'Enable debug mode')
    .option('--embedder-provider <provider>', 'Embedder provider')
    .option('--embedder-model <model>', 'Embedder model')
    .parse(process.argv);

const options = program.opts();

if (!options.dataset) {
    console.error('Please provide the dataset path');
    process.exit(1);
}

if (!options.baseUrl || !options.apiKey) {
    console.error('Please provide both base URL and API key for your OpenAI-compatible API provider');
    process.exit(1);
}

async function processConversations(
    graphManager: GraphManager,
    conversations: Array<{
        role: string;
        content: string;
        sessionId: string;
        timestamp: Date;
    }>,
    batchSize: number,
    processingLayer: number
) {
    console.log('Processing conversations...\n');

    // Group messages by session
    const sessions = new Map<string, Array<{ role: string; content: string; timestamp: Date }>>();
    conversations.forEach(msg => {
        const msgs = sessions.get(msg.sessionId) || [];
        msgs.push(msg);
        sessions.set(msg.sessionId, msgs);
    });

    for (const [sessionId, sessionMessages] of sessions) {
        for (let i = 0; i < sessionMessages.length; i += batchSize) {
            const batch = sessionMessages.slice(i, i + batchSize);
            console.log(`Processing batch of ${batch.length} messages...`);

            // Create MessageEpisode from batch
            const episode = new MessageEpisode(
                `episode_${sessionId}_${i}`,  // episodeId
                sessionId,
                batch[0].timestamp,  // use first message timestamp as reference
                batch.map((msg, index) => ({
                    id: `turn_${sessionId}_${i + index}`,
                    body: msg.content,
                    role: msg.role,
                    timestamp: msg.timestamp,
                    turnId: `turn_${i + index}`
                }))
            );

            // Process the episode
            await graphManager.ingest(episode, processingLayer);
        }
    }
}

async function displayStats(graphManager: GraphManager) {
    const stats = graphManager.getProcessingStats();
    
    console.log('\n=== Processing Statistics ===');
    console.log(`Total LLM Calls: ${stats.llmCalls.length}`);
    
    console.log('\nLLM Call Details:');
    stats.llmCalls.forEach((call, index) => {
        console.log(`\nCall #${index + 1}:`);
        console.log(`  Task: ${call.task}`);
        console.log(`  Duration: ${call.duration}ms`);
        console.log(`  Success: ${call.success}`);
        if (call.metadata?.inputEntities !== undefined) {
            console.log(`  Input Entities: ${call.metadata.inputEntities}`);
        }
        if (call.metadata?.outputEntities !== undefined) {
            console.log(`  Output Entities: ${call.metadata.outputEntities}`);
        }
    });
    
    const successfulCalls = stats.llmCalls.filter(call => call.success);
    const totalDuration = successfulCalls.reduce((sum, call) => sum + call.duration, 0);
    
    console.log('\nSummary:');
    console.log(`Successful Calls: ${successfulCalls.length}/${stats.llmCalls.length}`);
    console.log(`Total Processing Time: ${totalDuration}ms`);
    if (successfulCalls.length > 0) {
        console.log(`Average Call Duration: ${Math.round(totalDuration / successfulCalls.length)}ms`);
    }
}

async function main() {
    const datasetPath = expandPath(options.dataset);
    const outputPath = expandPath(options.output);

    // Ensure output directory exists
    await fs.mkdir(outputPath, { recursive: true });

    // Read and parse dataset
    const rawData = await fs.readFile(datasetPath, 'utf-8');
    const dataset = JSON.parse(rawData) as Dataset;

    // Initialize OpenAI client
    const openai = new OpenAI({
        apiKey: options.apiKey,
        baseURL: options.baseUrl
    });

    // Configure graph manager
    const llmConfig: LLMConfig & { client: OpenAI } = {
        model: options.model,
        temperature: parseFloat(options.temperature),
        maxTokens: parseInt(options.maxTokens),
        apiKey: options.apiKey,
        baseURL: options.baseUrl,
        client: openai
    };

    const embedderConfig = options.embedderProvider ? {
        provider: options.embedderProvider.toLowerCase(),
        config: {
            modelName: options.embedderModel
        }
    } : undefined;

    const graphConfig: GraphConfig = {
        ...(options.embedderProvider ? { embedder: {
            provider: options.embedderProvider.toUpperCase() as any,
            config: {
                modelName: options.embedderModel,
                maxTokens: 512,
                batchSize: 32
            }
        } } : {}),
        llm: llmConfig,
        search: {
            textWeight: 0.4,
            embeddingWeight: 0.6,
            minTextScore: 0.1,
            minEmbeddingScore: 0.5,
            limit: 10
        }
    };

    // Initialize graph manager
    const graphManager = new GraphManager(graphConfig, new DeterministicIdGenerator());

    try {
        // Process conversations
        console.log('Processing conversations...');
        const batchSize = parseInt(options.batchSize);

        const conversations = dataset.conversations.flatMap(session =>
            session.turns.flatMap(turn =>
                turn.messages.map(message => ({
                    role: message.role,
                    content: message.content,
                    sessionId: session.session_id,
                    timestamp: new Date(session.timestamp)
                }))
            )
        );

        await processConversations(graphManager, conversations, batchSize, parseInt(options.layer));

        // Get final graph state
        const snapshot = await graphManager.getSnapshot({});

        // Write graph state to file
        const output = {
            nodes: {
                episodes: snapshot.nodes.episodes.map(node => ({
                    ...node,
                    metadata: Object.fromEntries(node.metadata || new Map())
                })),
                mentions: snapshot.nodes.mentions.map(node => ({
                    ...node,
                    metadata: Object.fromEntries(node.metadata || new Map())
                })),
                canonicals: snapshot.nodes.canonicals.map(node => ({
                    ...node,
                    metadata: Object.fromEntries(node.metadata || new Map())
                }))
            },
            edges: {
                episode_sequence: snapshot.edges.episode_sequence,
                mention_to_episode: snapshot.edges.mention_to_episode,
                mention_to_canonical: snapshot.edges.mention_to_canonical
            }
        };

        // Write to output file
        const outputPathFile = path.join(outputPath, 'graph.json');
        await fs.mkdir(path.dirname(outputPathFile), { recursive: true });
        await fs.writeFile(outputPathFile, JSON.stringify(output, null, 2));

        console.log('\nProcessing complete. Results written to:', outputPathFile);
    } finally {
        // Always show stats, even if processing failed
        await displayStats(graphManager);
    }
}

main().catch((err: any) => {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('Error processing dataset:', errorMessage);
    process.exit(1);
});
