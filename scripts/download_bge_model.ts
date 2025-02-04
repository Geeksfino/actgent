import { pipeline, env } from '@xenova/transformers';
import path from 'path';
import fs from 'fs';

async function downloadModel() {
    // Force WASM backend
    env.backends.onnx.wasm.numThreads = 1;
    env.backends.onnx.wasm.proxy = false;
    env.useBrowserCache = false;
    
    // Set custom cache directory in the project
    const modelCacheDir = path.join(process.cwd(), 'models', 'bge');
    env.cacheDir = modelCacheDir;
    
    // Ensure directory exists
    if (!fs.existsSync(modelCacheDir)) {
        fs.mkdirSync(modelCacheDir, { recursive: true });
    }
    
    console.log('Starting BGE model download...');
    console.log(`Model files will be saved to: ${modelCacheDir}`);
    
    // We'll download one model at a time to avoid memory issues
    const modelConfigs = [
        { name: 'BAAI/bge-m3-lite', quantized: true },  // Start with smallest model
        { name: 'BAAI/bge-m3-lite', quantized: false },
        { name: 'BAAI/bge-m3', quantized: true },
        { name: 'BAAI/bge-m3', quantized: false }
    ];
    
    for (const modelConfig of modelConfigs) {
        try {
            console.log(`\nDownloading ${modelConfig.name} ${modelConfig.quantized ? '(quantized)' : '(full)'}`);
            
            // Initialize pipeline with explicit WASM configuration
            const pipe = await pipeline('feature-extraction', modelConfig.name, {
                quantized: modelConfig.quantized,
                revision: modelConfig.quantized ? 'quantized' : 'main',
                progress_callback: (progress) => {
                    if (progress.status === 'downloading') {
                        console.log(`Downloading ${progress.file}: ${Math.round(progress.progress * 100)}%`);
                    } else if (progress.status === 'loading') {
                        console.log(`Loading ${progress.file} into memory...`);
                    }
                }
            });
            
            // Test the model with a simple input
            console.log('Testing model...');
            const result = await pipe('Test input');
            console.log('Model test successful!');
            
            // Clean up resources
            if (pipe && typeof pipe.dispose === 'function') {
                await pipe.dispose();
            }
            
            // Force garbage collection if available
            if (global.gc) {
                global.gc();
            }
            
        } catch (error) {
            console.error(`Failed to download/test ${modelConfig.name} (${modelConfig.quantized ? 'quantized' : 'full'}):`);
            console.error(error);
            console.log('\nTrying to continue with next model...');
            continue;
        }
    }
    
    console.log('\nModel download process completed!');
    console.log('Note: Some models might have failed to download. Check the logs above for details.');
    console.log('\nTo use the successfully downloaded models:');
    console.log('1. Configure BGEConfig to use the local cache directory:');
    console.log('   const config: BGEConfig = {');
    console.log('     modelName: "BAAI/bge-m3-lite",  // or other model name');
    console.log('     quantized: true,  // or false');
    console.log(`     cacheDir: "${modelCacheDir}"`);
    console.log('   };');
}

downloadModel().catch(console.error);
