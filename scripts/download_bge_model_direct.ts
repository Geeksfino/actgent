import fs from 'fs';
import path from 'path';
import { fetch } from 'bun';

const HF_TOKEN = process.env.HF_TOKEN;

if (!HF_TOKEN) {
    console.error('Please set HF_TOKEN environment variable. You can get it from https://huggingface.co/settings/tokens');
    process.exit(1);
}

async function downloadFile(url: string, outputPath: string) {
    console.log(`Downloading ${path.basename(url)} to ${outputPath}`);
    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${HF_TOKEN}`
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    await Bun.write(outputPath, buffer);
    console.log(`Downloaded ${path.basename(url)}`);
}

async function downloadModel(model: string, revision: string = 'main') {
    const baseUrl = `https://huggingface.co/${model}/resolve/${revision}`;
    const files = [
        'config.json',
        'model.safetensors',
        'tokenizer.json',
        'tokenizer_config.json',
        'special_tokens_map.json'
    ];

    const modelDir = path.join(process.cwd(), 'models', 'bge', model.replace('/', '/'));
    await fs.promises.mkdir(modelDir, { recursive: true });

    for (const file of files) {
        const url = `${baseUrl}/${file}`;
        const outputPath = path.join(modelDir, file);
        
        try {
            await downloadFile(url, outputPath);
        } catch (error) {
            console.warn(`Warning: Failed to download ${file}, this might be optional: ${error.message}`);
        }
    }
}

async function main() {
    // Download BGE-M3-lite (smaller model) first
    console.log('\nDownloading BGE-M3-lite (main)...');
    await downloadModel('BAAI/bge-m3-lite');
    
    console.log('\nDownloading BGE-M3-lite (quantized)...');
    await downloadModel('BAAI/bge-m3-lite', 'quantized');
    
    // Then download BGE-M3 if needed
    console.log('\nDownloading BGE-M3 (main)...');
    await downloadModel('BAAI/bge-m3');
    
    console.log('\nDownloading BGE-M3 (quantized)...');
    await downloadModel('BAAI/bge-m3', 'quantized');
    
    console.log('\nAll downloads completed!');
}

main().catch(console.error);
