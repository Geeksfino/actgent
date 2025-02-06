import { LongMemEvalRunner } from './longmemeval';
import { GraphConfig, LLMConfig } from '../../../src/core/memory/graph/types';
import { OpenAI } from 'openai';
import { Command } from 'commander';
import path from 'path';

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
    .name('run_longmemeval')
    .description('Run LongMemEval benchmark')
    .option('--dataset <path>', 'Path to dataset file', './data/longmemeval_s.json')
    .option('--predictions <path>', 'Path to output predictions file', './data/predictions_s.jsonl')
    .option('--base-url <url>', 'Base URL for OpenAI-compatible API')
    .option('--api-key <key>', 'API key for OpenAI-compatible API')
    .option('--model <name>', 'Model name to use for completions', 'gpt-4')
    .option('--temperature <n>', 'Temperature for completions', '0')
    .option('--max-tokens <n>', 'Maximum tokens for completions', '500')
    .option('--hf-token <token>', 'Hugging Face token for model access')
    .option('--debug', 'Enable debug mode')
    .option(
        '--instance <specifier>',
        `Specify instance(s) to process.  Examples:
        - A number (e.g., '0'):  process the dataset instance of that id
        - A question ID (e.g., 'camera_eval_001'): process the dataset instance matching that question id
        - A range (e.g., '0-4'): process instances 0 through 4
        - A JSON object (e.g., '{"id": 0, "sessions": "2-4", "turns": 2}'): fetch session 2 to 4 of instance 0. The processing (such as triggering LLM call) is every 2 turns (which is 4 messages). If \"sessions\" contains numbers of -1 or a number larger than the current instance has, we just treat it as loading up the entire instance data`
    )
    .parse(process.argv);

const options = program.opts();

if (!options.dataset || !options.predictions) {
    console.error('Please provide both dataset and predictions paths');
    process.exit(1);
}

if (!options.baseUrl) {
    console.error('Please provide the base URL for your OpenAI-compatible API provider');
    process.exit(1);
}

if (!options.apiKey) {
    console.error('Please provide the API key for your OpenAI-compatible API provider');
    process.exit(1);
}

if (!options.model) {
    console.error('Please provide the model name to use for completions');
    process.exit(1);
}

if (!options.hfToken && !process.env.HF_TOKEN) {
    console.error('Please provide the Hugging Face token for model access using --hf-token or set the HF_TOKEN environment variable');
    process.exit(1);
}

if (options.hfToken) {
    process.env.HF_TOKEN = options.hfToken;
}

// Step 1: Create LLM configuration
const llmConfig: LLMConfig = {
    model: options.model || 'gpt-4',
    apiKey: options.apiKey,
    baseURL: options.baseUrl,
    temperature: parseFloat(options.temperature || '0'),
    maxTokens: parseInt(options.maxTokens || '500'),
    streamMode: false
};

// Initialize OpenAI client
const openaiClient = new OpenAI({
    apiKey: llmConfig.apiKey,
    baseURL: llmConfig.baseURL
});

// Step 3: Create GraphConfig with the full LLM config
const graphConfig: GraphConfig = {
    storage: {
        type: 'memory',
        config: {
            maxCapacity: 1000
        }
    },
    llm: {
        ...llmConfig,
        client: openaiClient
    }
};

async function main() {
    const debug = options.debug;
    const runner = new LongMemEvalRunner(
        expandPath(options.dataset),
        expandPath(options.predictions),
        debug,
        options.apiKey,
        options.baseUrl,
        options.model,
        parseFloat(options.temperature || '0'),
        parseInt(options.maxTokens || '500')
    );
    
    try {
        if (options.instance !== undefined) {
            await runner.runSpecific(options.instance);
            process.exit(0); // Exit after processing the specified instance(s)
        } else {
            await runner.runAll();
        }
    } catch (err: any) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error('Error:', errorMessage);
        process.exit(1);
    }
}

main().catch((err: any) => {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('Error running benchmark:', errorMessage);
    process.exit(1);
});
