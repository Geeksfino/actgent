import { LongMemEvalRunner } from './longmemeval';
import { GraphConfig, LLMConfig } from '../../../src/core/memory/graph/types';
import { OpenAI } from 'openai';
import { program } from 'commander';
import { join } from 'path';

// Expand "~" to home directory in paths
function expandPath(path: string): string {
    if (path.startsWith('~/')) {
        return join(process.env.HOME || process.env.USERPROFILE || '', path.slice(2));
    }
    return path;
}

program
    .option('-d, --dataset <path>', 'Path to the dataset file')
    .option('-p, --predictions <path>', 'Path to save predictions')
    .option('--base-url <url>', 'Base URL for OpenAI-compatible API')
    .option('--api-key <key>', 'API key for OpenAI-compatible API')
    .option('--model <name>', 'Model name to use for completions')
    .option('--hf-token <token>', 'Hugging Face token for model access')
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
    model: options.model,
    apiKey: options.apiKey,
    baseURL: options.baseUrl,
    temperature: 0,
    maxTokens: 150,
    streamMode: false
};

// Step 2: Initialize OpenAI client
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

// Step 4: Create LongMemEvalRunner
const runner = new LongMemEvalRunner(
    expandPath(options.dataset),
    expandPath(options.predictions),
    graphConfig,
    llmConfig
);

runner.runAll().catch((error: Error) => {
    console.error('Error running benchmark:', error);
    process.exit(1);
});
