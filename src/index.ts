import { AgentRegistry } from './AgentRegistry';
import { BaseAgent } from './BaseAgent';

const grpcPort = parseInt(process.env.REGISTRY_GRPC_PORT || '1146');
const httpPort = parseInt(process.env.REGISTRY_HTTP_PORT || '1147');
const llmApiKey = process.env.LLM_API_KEY || '';
const llmProviderUrl = process.env.LLM_PROVIDER_URL || '';

AgentRegistry.init({ httpPort, grpcPort, apiKey: llmApiKey, baseURL: llmProviderUrl });

const chatter = new BaseAgent({
  name: 'Chatter',
  capabilities: [{ name: 'gossip', description: 'Can engage in casual conversation and assist new agents' }],
  goal: 'Assist other agents joining the network for testing purposes',
  llmConfig: { apiKey: llmApiKey, model: 'gpt-4' },
});

const chatterId = AgentRegistry.getInstance() .registerAgent(chatter);
console.log(`Chatter agent registered with ID: ${chatterId}`);

chatter.sendTask('Hello, how are you?');
chatter.chat('chat with agent');


