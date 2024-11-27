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
import { JSONOutput, Tool, ToolOutput } from '../core/Tool';
import { logger } from '../core/Logger';

export abstract class BaseAgent<
  T extends readonly ClassificationTypeConfig[],
  K extends IClassifier<T>,
  P extends IAgentPromptTemplate
>   {
  protected core!: AgentCore;
  private classifier!: K;
  private promptTemplate!: P;
  private svcConfig: AgentServiceConfig;
  private communication?: Communication;
  private sessions: Map<string, Session> = new Map();
  private httpStreamCallback?: (delta: string, control?: { type: 'completion', reason: string }) => void;

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
    this.svcConfig = svc_config;
    this.init(core_config, svc_config, schemaTypes, loggingConfig);
  }

  protected init(
    core_config: AgentCoreConfig,
    svc_config: AgentServiceConfig,
    schemaTypes: T,
    loggingConfig?: LoggingConfig
  ) {
    this.svcConfig = svc_config;
    const llmConfig = svc_config.llmConfig;

    this.classifier = this.createClassifier(schemaTypes);
    this.promptTemplate = this.createPromptTemplate(schemaTypes);

    this.core = new AgentCore(
      core_config,
      svc_config.llmConfig!,
      this.promptTemplate,
      this.classifier,
      undefined,
      loggingConfig
    );
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
    
    // Initialize communication if HTTP port is configured
    if (this.svcConfig.communicationConfig?.httpPort) {
      this.communication = new Communication(
        this.svcConfig.communicationConfig,
        this
      );
      await this.communication.start();

      // Set up streaming if enabled and core streaming is enabled
      if (this.svcConfig.communicationConfig.enableStreaming && this.core.llmConfig?.streamMode) {
        logger.debug('Setting up streaming callback');
        this.httpStreamCallback = (delta: string, control?: { type: 'completion', reason: string }) => {
          if (control?.type === 'completion') {
            // Send completion signal as a special message
            const completionMessage = JSON.stringify({
              type: 'completion',
              reason: control.reason
            });
            this.communication?.broadcastStreamData('', completionMessage);
            logger.debug(`Stream completed with reason: ${control.reason}`);
          } else {
            // Normal stream data
            this.communication?.broadcastStreamData('', delta);
          }
        };
        this.core.registerStreamCallback(this.httpStreamCallback);
      }
    }
    
    this.core.start();
  }

  public async createSession(owner: string, description: string, enhancePrompt: boolean = false): Promise<Session> {
    let prompt = description;
    if (enhancePrompt) {
      prompt = await this.enhancePrompt(description);
    }
    
    const session = await this.core.createSession(owner, prompt);

    session.onToolResult((result: any, session: Session) => {
      this.defaultToolResultHandler(result, session);
    });

    return session;
  }

  private defaultToolResultHandler(result: any, session: Session): void {
    logger.debug("Tool result received:", result);
    
    if (result.status === 'success') {
      let content = '';
      if (result.data instanceof JSONOutput) {
        content = result.data.getContent();
      } else if (typeof result.data === 'object' && result.data !== null) {
        content = JSON.stringify(result.data);
      } else {
        content = String(result.data);
      }
      
      // Send the result back with tool name and result marker
      const formattedResponse = `[${result.toolName || 'Tool'} Result]: ${content}`;

      const msg = `[Agent ${this.core.name}] got back ${formattedResponse}. Use this result to infer response to the user.`;
      session.chat(msg, "assistant").catch(error => {
        logger.error("Error sending tool result back to LLM:", error);
      });
    }
    else {
      const message = `Tool execution failed: ${result.error}. Please determine the next action to take or respond to the user with explanation.`;
      session.chat(message, "assistant").catch(error => {
        logger.error("Error sending tool result back to LLM:", error);
      });
    }
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

  public async shutdown(): Promise<void> {
    // Clean up HTTP streaming callback
    if (this.httpStreamCallback) {
      logger.debug('Removing HTTP stream callback during shutdown');
      this.core.removeStreamCallback(this.httpStreamCallback);
      this.httpStreamCallback = undefined;
    }

    if (this.communication) {
      await this.communication.stop();
    }
    await this.core.shutdown();
  }

  // Allow registration of additional stream callbacks
  public registerStreamCallback(callback: (delta: string) => void): void {
    if (this.core.llmConfig?.streamMode) {
      logger.debug('Registering additional stream callback');
      this.core.registerStreamCallback(callback);
    } else {
      logger.warning('Stream callback registration requested but core streaming is disabled');
    }
  }

  public debugPrompt(sessionContext: any, input: string, context: any): Object {
    return this.core.debugPrompt(sessionContext, input, context);
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

  public getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }   

  private async findHelperAgent(subtask: string): Promise<AgentCore | null> {
    console.log('findHelperAgent called with subtask:', subtask);
    const agent = await AgentRegistry.getInstance().findAgentByCapabilities(subtask);
    return agent;
  }

}
