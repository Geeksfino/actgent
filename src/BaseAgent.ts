import { AgentCoreConfig, Tool, LLMConfig, CommunicationConfig, AgentServiceConfig  } from './interfaces';
import { Communication } from './Communication';
import { AgentRegistry } from './AgentRegistry';
import { AgentCore } from './AgentCore';
import { IAgentPromptTemplate } from './IPromptTemplate';
import { ClassificationTypeConfig, IClassifier} from './IClassifier';
import { Message } from './Message';
import { InferClassificationUnion } from './TypeInference';  
import { Session } from './Session';

const defaultCommunicationConfig: CommunicationConfig = {};

export abstract class BaseAgent<
  T extends readonly ClassificationTypeConfig[],
  K extends IClassifier<T>,
  P extends IAgentPromptTemplate
>  {
  private core!: AgentCore;
  private classifier!: K;
  
  protected abstract useClassifierClass(schemaTypes: T): new () => K;
  protected abstract usePromptTemplateClass(): new (classificationTypes: T) => P;

  protected createClassifier(schemaTypes: T): K {
    const ClassToInstantiate = this.useClassifierClass(schemaTypes);
    return new ClassToInstantiate();
  }

  protected createPromptTemplate(classificationTypes: T): P {
    const ClassToInstantiate = this.usePromptTemplateClass();
    return new ClassToInstantiate(classificationTypes);
  }

  constructor(core_config: AgentCoreConfig, svc_config: AgentServiceConfig, schemaTypes: T) {
    this.init(core_config, svc_config, schemaTypes);
  }

  protected init(core_config: AgentCoreConfig, svc_config: AgentServiceConfig, schemaTypes: T) {
    const llmConfig = svc_config.llmConfig;

    this.classifier = this.createClassifier(schemaTypes);
    const promptTemplate = this.createPromptTemplate(schemaTypes);

    this.core = new AgentCore(core_config, llmConfig!, promptTemplate);
    this.core.addLLMResponseHandler(this.handleLLMResponse.bind(this));
  }

  public async run() {
    this.core.start();
  }

  public async createSession(owner: string, description: string): Promise<Session> {
    return await this.core.createSession(owner, description);
  }

  protected handleLLMResponse(response: string | InferClassificationUnion<T>, session: Session) {
    //console.log("BaseAgent handling LLM Response:");
    
    let parsedResponse: InferClassificationUnion<T>;
    
    if (typeof response === 'string') {
      try {
        parsedResponse = JSON.parse(response);
      } catch (error) {
        console.error("Failed to parse response string:", error);
        return;
      }
    } else {
      parsedResponse = response;
    }

    // console.log("Response type:", typeof parsedResponse);
    // console.log("Response content:", JSON.stringify(parsedResponse, null, 2));
    // console.log("Response keys:", Object.keys(parsedResponse));
    // console.log("messageType:", parsedResponse.messageType);
    
    this.classifier.handleLLMResponse(parsedResponse, session);
  }

  private async findHelperAgent(subtask: string): Promise<AgentCore | null> {
    console.log('findHelperAgent called with subtask:', subtask);
    const agent = await AgentRegistry.getInstance().findAgentByCapabilities(subtask); // Find agent using registry
    return agent;
  }
}
