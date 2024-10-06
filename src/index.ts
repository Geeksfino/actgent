import { AgentRegistry } from './AgentRegistry';
import { BaseAgent } from './BaseAgent';
import { AgentCoreConfig, AgentServiceConfig } from './interfaces';
import { ClassificationTypeConfig, IAgentPromptTemplate } from './IAgentPromptTemplate';
import { GenericPromptTemplate } from './GenericPromptTemplate';
import { InferClassificationUnion } from './TypeInference';

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

class TestAgent<T extends readonly ClassificationTypeConfig[]> extends BaseAgent<GenericPromptTemplate<T>> {

  constructor(core_config: AgentCoreConfig, svc_config: AgentServiceConfig) {
    super(core_config, svc_config);
  }

  protected usePromptTemplateClass(): new (classificationTypes: T) => GenericPromptTemplate<T> {
    return GenericPromptTemplate;
  }
}

console.log("svcconfig:" + JSON.stringify(svcConfig));
const testAgent = new TestAgent<readonly ClassificationTypeConfig[]>(coreConfig, svcConfig);
testAgent.run();

const session = await testAgent.createSession("owner", 'How to create web site?');

// Handler function to print out data received
const clarificationHandler = (data: InferClassificationUnion<readonly ClassificationTypeConfig[]>): void => {
    console.log("Clarification needed:", data);
};

// Pass the handler to the session
session.onClarificationNeeded(clarificationHandler);

session.onResult(obj => console.log(obj));