import { AgentCoreConfig, Tool, LLMConfig, CommunicationConfig, AgentServiceConfig  } from './interfaces';
import { Communication } from './Communication';
import { AgentRegistry } from './AgentRegistry';
import { AgentCore } from './AgentCore';
import { IAgentPromptTemplate } from './IPromptTemplate';
import { ClassificationTypeConfig, IClassifier} from './IClassifier';
import { Message } from './Message';
import { InferClassificationUnion } from './TypeInference';  
import { Session } from './Session';
import { LoggingConfig } from './interfaces';

const defaultCommunicationConfig: CommunicationConfig = {};

export abstract class BaseAgent<
  T extends readonly ClassificationTypeConfig[],
  K extends IClassifier<T>,
  P extends IAgentPromptTemplate
>  {
  protected core!: AgentCore;
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

  constructor(
    core_config: AgentCoreConfig,
    svc_config: AgentServiceConfig,
    schemaTypes: T,
    loggingConfig?: LoggingConfig
  ) {
    this.init(core_config, svc_config, schemaTypes, loggingConfig);
  }

  protected init(
    core_config: AgentCoreConfig,
    svc_config: AgentServiceConfig,
    schemaTypes: T,
    loggingConfig?: LoggingConfig
  ) {
    const llmConfig = svc_config.llmConfig;

    this.classifier = this.createClassifier(schemaTypes);
    const promptTemplate = this.createPromptTemplate(schemaTypes);

    this.core = new AgentCore(core_config, llmConfig!, promptTemplate, undefined, loggingConfig);
    this.core.addLLMResponseHandler(this.handleLLMResponse.bind(this));
  }

  public getName(): string {
    return this.core.name;
  }

  public getRole(): string {
    return this.core.role;
  }

  public getGoal(): string {
    return this.core.goal;
  }

  public getCapabilities(): string {
    return this.core.capabilities;
  } 

  public getInstructions(): Map<string, string> | undefined {
    return this.core.getInstructions();
  }

  public addInstruction(name: string, instruction: string): void {
    this.core.addInstruction(name, instruction);
  }

  public log(sessionId: string, message: string): void {
    this.core.log(sessionId, message);
  }

  public async run(loggingConfig?: LoggingConfig) {
    if (loggingConfig) {
        this.core.setLoggingConfig(loggingConfig);
    }
    this.core.start();
  }

  public async createSession(owner: string, description: string): Promise<Session> {
    return await this.core.createSession(owner, description);
  }

  protected handleLLMResponse(response: string | InferClassificationUnion<T>, session: Session) {
    let parsedResponse: InferClassificationUnion<T>;
    
    if (typeof response === 'string') {
      try {
        parsedResponse = JSON.parse(response);
      } catch (error) {
        this.core.log(session.sessionId, `Failed to parse response string: ${error}`);
        return;
      }
    } else {
      parsedResponse = response;
    }
    
    this.classifier.handleLLMResponse(parsedResponse, session);
  }

  public registerStreamCallback(callback?: (delta: string) => void): void {
    if (callback) {
      this.core.registerStreamCallback(callback);
    } else {
      // Default line-by-line stream handler
      this.core.registerStreamCallback((delta: string) => {
        process.stdout.write(delta);
      });
    }
  }

  public resolvePrompt(sessionContext: any, input: string, context: any): Object {
    return this.core.resolvePrompt(sessionContext, input, context);
  }

  private async findHelperAgent(subtask: string): Promise<AgentCore | null> {
    console.log('findHelperAgent called with subtask:', subtask);
    const agent = await AgentRegistry.getInstance().findAgentByCapabilities(subtask);
    return agent;
  }
}
