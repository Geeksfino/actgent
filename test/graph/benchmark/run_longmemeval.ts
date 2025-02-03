import { LongMemEvalRunner } from './longmemeval';
import { join } from 'path';
import { writeFileSync } from 'fs';

// Expand "~" to home directory in paths
function expandPath(path: string): string {
    if (path.startsWith('~/') || path === '~') {
        const home = process.env.HOME;
        if (!home) {
            throw new Error('HOME environment variable is not set');
        }
        return path.replace(/^~/, home);
    }
    return path;
}

// Simple command-line argument parser for arguments in the form --key=value
function parseArgs() {
    const args = process.argv.slice(2);
    const argObj: { [key: string]: string } = {};
    args.forEach(arg => {
        if (arg.startsWith('--')) {
            const parts = arg.slice(2).split('=');
            argObj[parts[0]] = parts[1] || '';
        }
    });
    return argObj;
}

const args = parseArgs();

// Use provided input and output paths; otherwise default
const datasetPath = expandPath(args.input || join(__dirname, 'data/longmemeval_s.json'));
const outputPath = expandPath(args.output || join(__dirname, 'longmemeval_results.json'));

console.log('Starting LongMemEval benchmark...');
console.log(`Using dataset: ${datasetPath}\n`);

const runner = new LongMemEvalRunner(datasetPath);

runner.runAll()
    .then(results => {
        console.log(`Benchmark completed. Saving results to: ${outputPath}`);
        const resultsJson = {
            results: results,
            timestamp: new Date().toISOString(),
            metadata: {
                datasetPath,
                outputPath
            }
        };
        writeFileSync(outputPath, JSON.stringify(resultsJson, null, 2), 'utf-8');
    })
    .catch(error => {
        console.error('Error running benchmark:', error);
        process.exit(1);
    });
