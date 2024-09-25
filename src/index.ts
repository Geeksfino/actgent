import { AgentRegistry } from './AgentRegistry';
import { BaseAgent } from './BaseAgent';

const grpcPort = parseInt(process.env.REGISTRY_GRPC_PORT || '1146');
const httpPort = parseInt(process.env.REGISTRY_HTTP_PORT || '1147');
const llmApiKey = process.env.LLM_API_KEY || 'sk-3df4e70b61a04a87b73497457a122327';
const llmProviderUrl = process.env.LLM_PROVIDER_URL || 'https://api.deepseek.com/v1';

AgentRegistry.init({ httpPort, grpcPort, apiKey: llmApiKey, model: 'deepseek-chat', baseURL: llmProviderUrl });

const chatter = new BaseAgent({
  name: 'Chatter',
  capabilities: [{ name: 'gossip', description: 'Can engage in casual conversation and assist new agents' }],
  goal: 'Assist other agents joining the network for testing purposes',
  llmConfig: { apiKey: llmApiKey, model: 'deepseek-chat', baseURL: llmProviderUrl },
});

const chatterId = AgentRegistry.getInstance() .registerAgent(chatter);
console.log(`Chatter agent registered with ID: ${chatterId}`);

chatter.createTask("owner", 'Build a simple chatbot');



