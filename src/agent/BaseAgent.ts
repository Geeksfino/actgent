import { AgentCoreConfig, LLMConfig, CommunicationConfig, AgentServiceConfig, Instruction  } from '../core/configs';
import { Communication } from './Communication';
import { AgentRegistry } from './AgentRegistry';
import { AgentCore } from '../core/AgentCore';
import { IAgentPromptTemplate } from '../core/IPromptTemplate';
import { ClassificationTypeConfig, IClassifier} from '../core/IClassifier';
import { ExecutionContext } from '../core/ExecutionContext';
import { InferClassificationUnion } from '../core/TypeInference';  
import { Session } from '../core/Session';
import { LoggingConfig } from '../core/configs';
import { Tool, ToolOutput } from '../core/Tool';

const defaultCommunicationConfig: CommunicationConfig = {};

export abstract class BaseAgent<
  T extends readonly ClassificationTypeConfig[],
  K extends IClassifier<T>,
  P extends IAgentPromptTemplate
>  {
  protected core!: AgentCore;
  private classifier!: K;
  private promptTemplate!: P;
  
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
    this.promptTemplate = this.createPromptTemplate(schemaTypes);

    this.core = new AgentCore(core_config, llmConfig!, this.promptTemplate, undefined, loggingConfig);
    this.core.addLLMResponseHandler(this.handleLLMResponse.bind(this));
  }

  public getExecutionContext(): ExecutionContext {
    return this.core.executionContext;
  }

  public setExecutionContext(executionContext: ExecutionContext): void {
    this.core.executionContext = executionContext;
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

  public getInstructions(): Instruction[] {
    return this.core.getInstructions();
  }

  public getInstructionByName(name: string): Instruction | undefined {
    return this.core.getInstructionByName(name);
  }

  public addInstruction(name: string, description: string, schemaTemplate?: string): void {
    this.core.addInstruction(name, description, schemaTemplate);
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

  public async createSession(owner: string, description: string, enhancePrompt: boolean = false): Promise<Session> {
    let prompt = description;
    if (enhancePrompt) {
      prompt = await this.enhancePrompt(description);
    }
    return await this.core.createSession(owner, prompt);
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

  public async enhancePrompt(message: string): Promise<string> {
    try {
      let responseContent = "";
      const stream = await this.core.llmClient.chat.completions.create({
        model: this.core.llmConfig?.model || "gpt-4",
        messages: [
          { role: "system", content: this.promptTemplate.getMetaPrompt() },
          { role: "user", content: message },
        ],
        stream: true,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || "";
        responseContent += delta;
        this.core.streamBuffer += delta;
        this.core.processStreamBuffer();
      }
      // Process any remaining content in the buffer
      this.core.processStreamBuffer(true);

      return responseContent || "{}";
    } catch (error) {
      console.log(`Error interacting with LLM: ${error}`);
      throw error;
    }
  }

  public registerTool<TInput, TOutput extends ToolOutput>(tool: Tool<TInput, TOutput>): void {
    this.core.registerTool(tool);
  }

  public getTool<TInput, TOutput extends ToolOutput>(name: string): Tool<TInput, TOutput> | undefined {
    return this.core.getTool(name);
  }

  private async findHelperAgent(subtask: string): Promise<AgentCore | null> {
    console.log('findHelperAgent called with subtask:', subtask);
    const agent = await AgentRegistry.getInstance().findAgentByCapabilities(subtask);
    return agent;
  }

  public async shutdown(): Promise<void> {
    this.log('default', 'Shutting down agent...');
    await this.core.shutdown();
    this.log('default', 'Agent shutdown complete.');
  }
}
