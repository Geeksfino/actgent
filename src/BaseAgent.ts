import { AgentCoreConfig, Tool, LLMConfig, CommunicationConfig, AgentServiceConfig  } from './interfaces';
import { Communication } from './Communication';
import { AgentRegistry } from './AgentRegistry';
import { AgentCore } from './AgentCore';
import { IAgentPromptTemplate } from './IAgentPromptTemplate';
import { ClassificationTypeConfig, IClassifier} from './IClassifier';
import { Message } from './Message';
import { InferClassificationUnion, InferClassificationType } from './TypeInference';  
import { Session } from './Session';

const defaultCommunicationConfig: CommunicationConfig = {};

export abstract class BaseAgent<
  T extends readonly ClassificationTypeConfig[],
  K extends IClassifier<T>,
  P extends IAgentPromptTemplate
>  {
  private core!: AgentCore;
  private classifier!: K;
  
  protected abstract useClassifierClass(): new () => K;
  protected abstract usePromptTemplateClass(): new (classificationTypes: T) => P;

  protected createClassifier(): K {
    const ClassToInstantiate = this.useClassifierClass();
    return new ClassToInstantiate();
  }

  protected createPromptTemplate(classificationTypes: T): P {
    const ClassToInstantiate = this.usePromptTemplateClass();
    return new ClassToInstantiate(classificationTypes);
  }

  constructor(core_config: AgentCoreConfig, svc_config: AgentServiceConfig) {
    this.init(core_config, svc_config);
  }

  protected init(core_config: AgentCoreConfig, svc_config: AgentServiceConfig) {
    const llmConfig = svc_config.llmConfig;

    this.classifier = this.createClassifier();
    const promptTemplate = this.createPromptTemplate(this.classifier.getClassificationTypeDefinition());

    this.core = new AgentCore(core_config, llmConfig!, promptTemplate);
    this.core.addLLMResponseHandler(this.handleLLMResponse.bind(this));
  }

  public async run() {
    this.core.start();
  }

  public async createSession(owner: string, description: string): Promise<Session> {
    return await this.core.createSession(owner, description);
  }

  protected handleLLMResponse(response: any, session: Session) {
    this.classifier.handleLLMResponse(response, session);
  }

  private async findHelperAgent(subtask: string): Promise<AgentCore | null> {
    console.log('findHelperAgent called with subtask:', subtask);
    const agent = await AgentRegistry.getInstance().findAgentByCapabilities(subtask); // Find agent using registry
    return agent;
  }
}
