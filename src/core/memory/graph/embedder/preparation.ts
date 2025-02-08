import { z } from 'zod';

export function prepareForEmbedding(data: any): { prompt: string; functionSchema: z.ZodType<any> } {
    console.log("PREPARE_FOR_EMBEDDING data: ", data);
    const prepareForEmbeddingPrompt = `Prepare text for embedding:\n${JSON.stringify(data)}`;
    console.log("PREPARE_FOR_EMBEDDING prompt: ", prepareForEmbeddingPrompt);
    return {
        prompt: prepareForEmbeddingPrompt,
        functionSchema: z.array(z.number())
    };
}
