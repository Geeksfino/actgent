import { Command } from 'commander';
import { GraphManager } from '../../src/core/memory/graph/GraphManager';
import { GraphConfig, LLMConfig, GraphTask } from '../../src/core/memory/graph/types';
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
    }>,
    batchSize: number,
    processingLayer: number
) {
    console.log('Processing conversations...\n');

    // Group messages by session
    const sessions = new Map<string, Array<{ role: string; content: string }>>();
    conversations.forEach(msg => {
        const msgs = sessions.get(msg.sessionId) || [];
        msgs.push(msg);
        sessions.set(msg.sessionId, msgs);
    });

    for (const [sessionId, sessionMessages] of sessions) {
        for (let i = 0; i < sessionMessages.length; i += batchSize) {
            const batch = sessionMessages.slice(i, i + batchSize);
            console.log(`Processing batch of ${batch.length} messages...`);

            // Process episodic layer with specified processing depth
            const timestamp = new Date('2024-01-01T10:00:00.000Z');
            const episodeNodes = batch.map((msg, index) => ({
                id: `turn_${sessionId}_${i + index}`,
                body: msg.content,
                role: msg.role,
                timestamp,
                sessionId,
            }));
            await graphManager.ingest(episodeNodes, processingLayer);
        }
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

    // Process conversations
    console.log('Processing conversations...');
    const batchSize = parseInt(options.batchSize);

    const conversations = dataset.conversations.flatMap(session =>
        session.turns.flatMap(turn =>
            turn.messages.map(message => ({
                role: message.role,
                content: message.content,
                sessionId: session.session_id
            }))
        )
    );

    await processConversations(graphManager, conversations, batchSize, parseInt(options.layer));

    // Get final graph state
    const snapshot = await graphManager.getSnapshot({});

    // Format nodes and edges according to episodic graph spec
    const output = {
        nodes: snapshot.nodes
            .filter(node => node.type !== 'episode')
            .map(node => ({
                id: node.id,
                type: node.type,
                mention: node.content.mention,
                episode_id: node.content.episode_id,
                validAt: node.validAt?.toISOString(),
                createdAt: node.createdAt?.toISOString()
            })),
        edges: snapshot.edges.map(edge => ({
            id: edge.id,
            source: edge.sourceId,
            target: edge.targetId,
            type: edge.type,
            episode_id: edge.content.episode_id,
            validAt: edge.validAt?.toISOString(),
            createdAt: edge.createdAt?.toISOString()
        })),
        episodes: snapshot.nodes
            .filter(node => node.type === 'episode')
            .map(node => ({
                id: node.id,
                type: node.content.type,
                actor: node.content.actor,
                content: node.content.content,
                metadata: {
                    session_id: node.content.metadata.session_id,
                    turn_id: node.content.metadata.turn_id
                },
                validAt: node.validAt?.toISOString(),
                createdAt: node.createdAt?.toISOString()
            }))
    };

    await fs.writeFile(
        path.join(outputPath, 'graph.json'),
        JSON.stringify(output, null, 2)
    );

    console.log('\nProcessing complete. Results written to:', path.join(outputPath, 'graph.json'));
}

main().catch((err: any) => {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('Error processing dataset:', errorMessage);
    process.exit(1);
});
