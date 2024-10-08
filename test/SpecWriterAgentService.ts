import { ClassificationTypeConfig } from '../src/IClassifier';
import { InferClassificationUnion } from '../src/TypeInference';
import { SpecWriterAgent } from './SpecWriterAgent';

const grpcPort = parseInt(process.env.REGISTRY_GRPC_PORT || '1146');
const httpPort = parseInt(process.env.REGISTRY_HTTP_PORT || '1147');
const llmApiKey = process.env.LLM_API_KEY || 'sk-3df4e70b61a04a87b73497457a122327';
const llmProviderUrl = process.env.LLM_PROVIDER_URL || 'https://api.deepseek.com/v1';
const llmModel = process.env.LLM_MODEL || 'deepseek-chat';

console.log("llm provider url: " + llmProviderUrl);
console.log("llm model: " + llmModel);


const svcConfig = {
  llmConfig: {
    apiKey: llmApiKey,
    model: llmModel,
    baseURL: llmProviderUrl,
    streamMode: true,
  }
};


const specWriterAgent = new SpecWriterAgent(svcConfig);
specWriterAgent.registerStreamCallback((delta: string) => {
  console.log(delta);
});
specWriterAgent.run();

const session = await specWriterAgent.createSession("owner", 'Create a stock chart mini-program');

// Handler function to print out data received
const handler = (data: InferClassificationUnion<readonly ClassificationTypeConfig[]>): void => {
    console.log("Received event from session:", data);
};

// Pass the handler to the session
session.onEvent(handler);
