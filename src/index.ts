import { AgentRegistry } from './AgentRegistry';
import { BaseAgent } from './BaseAgent';
const grpcPort = parseInt(process.env.REGISTRY_GRPC_PORT || '1146');
const httpPort = parseInt(process.env.REGISTRY_HTTP_PORT || '1147');
const llmApiKey = process.env.LLM_API_KEY || 'sk-3df4e70b61a04a87b73497457a122327';
const llmProviderUrl = process.env.LLM_PROVIDER_URL || 'https://api.deepseek.com/v1';

console.log("llm provider url: " + llmProviderUrl);

const config = {
  llmConfig: { apiKey: llmApiKey, model: 'deepseek-chat', baseURL: llmProviderUrl },
};

const agent = BaseAgent.getInstance(config);
agent.run();

await agent.createSession("owner", 'How to create web site?');
