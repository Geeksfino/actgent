import { AgentRegistry } from './AgentRegistry';
import { AgentCore } from './AgentCore';

const grpcPort = parseInt(process.env.REGISTRY_GRPC_PORT || '1146');
const httpPort = parseInt(process.env.REGISTRY_HTTP_PORT || '1147');
const llmApiKey = process.env.LLM_API_KEY || 'sk-3df4e70b61a04a87b73497457a122327';
const llmProviderUrl = process.env.LLM_PROVIDER_URL || 'https://api.deepseek.com/v1';

AgentRegistry.init({ httpPort, grpcPort, apiKey: llmApiKey, model: 'deepseek-chat', baseURL: llmProviderUrl });

const chatter = new AgentCore({
  name: 'Chatter',
  capabilities: [{ name: 'gossip', description: 'Can engage in casual conversation and assist new agents' }],
  goal: 'Create a detailed product specification document for a WeChat Mini Program',
  llmConfig: { apiKey: llmApiKey, model: 'deepseek-chat', baseURL: llmProviderUrl },
});

// Implement callback methods
chatter.setSimpleQueryCallback((answer: string) => {
  console.log('Simple Query Response:', answer);
});

chatter.setComplexTaskCallback((actionPlan: { task: string; subtasks: string[] }) => {
  console.log('Complex Task Action Plan:');
  console.log('Task:', actionPlan.task);
  console.log('Subtasks:');
  actionPlan.subtasks.forEach((task, index) => {
    console.log(`  ${index + 1}. ${task}`);
  });
});

chatter.setClarificationNeededCallback((questions: string[]) => {
  console.log('Clarification Needed:');
  questions.forEach((question, index) => {
    console.log(`  ${index + 1}. ${question}`);
  });
});

chatter.setCommandCallback((command: { action: string; parameters: Record<string, string>; expectedOutcome: string }) => {
  console.log('Command Received:');
  console.log('Action:', command.action);
  console.log('Parameters:', command.parameters);
  console.log('Expected Outcome:', command.expectedOutcome);
});

chatter.start();

const chatterId = AgentRegistry.getInstance().registerAgent(chatter);
console.log(`Chatter agent registered with ID: ${chatterId}`);

chatter.createSession("owner", 'Build a simple chatbot wechat mini-program front-end');