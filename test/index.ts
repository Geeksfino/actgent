import { ClassificationTypeConfig } from '../src/IClassifier';
import { InferClassificationUnion } from '../src/TypeInference';
import { TestAgent } from './TestAgent';

const grpcPort = parseInt(process.env.REGISTRY_GRPC_PORT || '1146');
const httpPort = parseInt(process.env.REGISTRY_HTTP_PORT || '1147');
const llmApiKey = process.env.LLM_API_KEY || 'sk-3df4e70b61a04a87b73497457a122327';
const llmProviderUrl = process.env.LLM_PROVIDER_URL || 'https://api.deepseek.com/v1';

console.log("llm provider url: " + llmProviderUrl);

const coreConfig = {
  name: "BaseAgent",
  role: "Software Product Manager",
  goal: 'Create software specification',
  capabilities: 'assist in testing',
};

const svcConfig = {
  llmConfig: {
    apiKey: llmApiKey,
    model: "deepseek-chat",
    baseURL: llmProviderUrl,
  }
};


const testAgent = new TestAgent(coreConfig, svcConfig);
testAgent.run();

const session = await testAgent.createSession("owner", 'How to create web site?');

// Handler function to print out data received
const clarificationHandler = (data: InferClassificationUnion<readonly ClassificationTypeConfig[]>): void => {
    console.log("Clarification needed:", data);
};

// Pass the handler to the session
session.onClarificationNeeded(clarificationHandler);

session.onResult(obj => console.log(obj));