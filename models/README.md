# Model Management

This directory contains pre-downloaded model files for various AI models used in the project.

## BGE Embedding Models

The BGE models (M3 and M3-lite) can be downloaded using the provided script:

```bash
# Download all BGE model variants
bun run scripts/download_bge_model.ts
```

### Model Variants

1. BGE-M3 (Full)
   - Size: ~1GB
   - Best quality embeddings
   - Directory: `bge/BAAI/bge-m3`

2. BGE-M3 (Quantized)
   - Size: ~250MB
   - Slightly lower quality but much smaller
   - Directory: `bge/BAAI/bge-m3/quantized`

3. BGE-M3-Lite (Full)
   - Size: ~500MB
   - Good balance of quality and size
   - Directory: `bge/BAAI/bge-m3-lite`

4. BGE-M3-Lite (Quantized)
   - Size: ~125MB
   - Smallest size, suitable for resource-constrained environments
   - Directory: `bge/BAAI/bge-m3-lite/quantized`

### Using Pre-downloaded Models

To use the pre-downloaded models in your code:

```typescript
import path from 'path';
import { BGEConfig } from './core/memory/graph/embedder/bge';

const config: BGEConfig = {
    modelName: 'BAAI/bge-m3',
    quantized: false,
    cacheDir: path.join(process.cwd(), 'models', 'bge')
};
```

### Model Files Location

The models will be downloaded to the following structure:
```
models/
  bge/
    BAAI/
      bge-m3/
        model.safetensors      # Full model weights
        tokenizer.json         # Tokenizer configuration
        config.json           # Model configuration
        quantized/           # Quantized model files
          ...
      bge-m3-lite/
        ...
```

### Gitignore

By default, model files are gitignored to keep the repository size manageable. If you want to distribute the models with your project:

1. Remove the relevant entries from .gitignore
2. Commit the model files
3. Consider using Git LFS for large file storage
