import { AgentCoreConfig, QueryPreProcessor, AgentServiceConfig, Instruction  } from '../core/configs';
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
  private httpStreamCallback?: (delta: string, control?: { type: 'completion', reason: string }, sessionId?: string) => void;

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

  private logger = logger.withContext({ 
    module: 'agent', 
    component: 'BaseAgent'
  });

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
      loggingConfig
    );
  }

  public setQueryPreProcessor(queryPreProcessor: QueryPreProcessor | null): void {
    this.core.setQueryPreProcessor(queryPreProcessor);
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
        this.httpStreamCallback = (delta: string, control?: { type: 'completion', reason: string }, sessionId?: string) => {
          if (control?.type === 'completion') {
            // Send completion signal as a special message with session ID
            const completionMessage = JSON.stringify({
              type: 'completion',
              reason: control.reason,
              sessionId: sessionId || '' // Include session ID in completion message
            });
            this.communication?.broadcastStreamData(sessionId || '', completionMessage);
            logger.debug(`Stream completed with reason: ${control.reason} for session: ${sessionId || 'unknown'}`);
          } else {
            // Normal stream data with session ID
            // If the delta is already a JSON string, try to parse and add sessionId if missing
            try {
              // Check if delta is a JSON string
              const parsedDelta = JSON.parse(delta);
              // Add sessionId if not already present
              if (!parsedDelta.sessionId && sessionId) {
                parsedDelta.sessionId = sessionId;
                // Broadcast the modified JSON
                this.communication?.broadcastStreamData(sessionId, JSON.stringify(parsedDelta));
              } else {
                // Already has sessionId or we don't have one to add
                this.communication?.broadcastStreamData(sessionId || '', delta);
              }
            } catch (e) {
              // Not a JSON string, just broadcast as is
              this.communication?.broadcastStreamData(sessionId || '', delta);
            }
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
    session.onEvent((event: any, session: Session) => {
      this.defaultEventHandler(event, session);
    });
    session.onRouting((message: any, session: Session) => {
      this.defaultRoutingHandler(message, session);
    });
    session.onException((raw: any, session: Session) => {
      this.defaultExceptionHandler(raw, session);
    });

    return session;
  }

  private defaultToolResultHandler(result: any, session: Session): void {
    logger.debug("Tool result received:", result);
    
    if (result.status === 'success') {
      let content = '';
      
      // Process the tool result data
      if (result.data instanceof JSONOutput) {
        // Get the content directly from JSONOutput
        let rawContent = result.data.getContent();
        
        // Check if it's a JSON with a content field structure that would cause nesting
        try {
          const parsed = JSON.parse(rawContent);
          if (parsed && typeof parsed === 'object' && parsed.content) {
            // If the output already has a content field, use the content directly
            // to avoid nesting issues and double stringification
            content = typeof parsed.content === 'string' ? 
              parsed.content : JSON.stringify(parsed.content);
          } else {
            // Use the parsed object directly to avoid double stringification
            content = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
          }
        } catch (e) {
          // If parsing fails, use the original content
          content = rawContent;
        }
      } else if (typeof result.data === 'object' && result.data !== null) {
        // For regular objects, check if they have a content field to avoid nesting
        if (result.data.content) {
          // Use the content directly if it's a string, otherwise stringify it once
          content = typeof result.data.content === 'string' ? 
            result.data.content : JSON.stringify(result.data.content);
        } else {
          // Use the data directly if it's a string, otherwise stringify it once
          content = typeof result.data === 'string' ? 
            result.data : JSON.stringify(result.data);
        }
      } else {
        // For primitive values, convert to string directly
        content = String(result.data);
      }
      
      // Format tool result according to OpenAI convention
      // The content should be just the raw tool output without any additional formatting
      session.chat(content, "tool", { 
        tool_call_id: result.toolCallId,
        // Don't add the tool_call flag as it might cause additional processing
        // that leads to nesting
      }).catch(error => {
        logger.error("Error sending tool result back to LLM:", error);
      });
    }
    else {
      // For failed tool executions, format error message
      const errorMessage = `Error: ${result.error}`;
      session.chat(errorMessage, "tool", { 
        tool_call_id: result.toolCallId
        // Removed tool_call: true to prevent potential nesting
      }).catch(error => {
        logger.error("Error sending tool failure back to LLM:", error);
      });
    }
  }

  private defaultEventHandler(event: any, session: Session): void {
    logger.debug("Event received:", event);
    
    try {
      // Format event content for logging
      const content = typeof event === 'object' ? JSON.stringify(event) : String(event);
      logger.debug(`[Agent ${this.core.name}] processed event: ${content}`);
    } catch (error) {
      logger.error(`Event processing failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private defaultExceptionHandler(raw: any, session: Session): void {
    logger.warn("Exception received:", raw);
    const sessionContext = session.getContext();
    const instruction = sessionContext?.getCurrentInstruction();
    
    try {
      session.chat(raw, "agent", { exception: true }).catch(error => {
        logger.error("Error sending exception back to LLM:", error);
      });
    } catch (error) {
      logger.error(`Exception processing failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  } 

  private defaultRoutingHandler(message: any, session: Session): void {
    logger.debug("Routing message received:", message);
    
    try {
      // Pass through the content.data without assuming its structure
      const routedData = message.content?.data || message;
      session.chat(JSON.stringify(routedData), "agent", { routed: true });
    } catch (error) {
      logger.error("Error sending routing error back to LLM:", error);
    }
  }

  protected handleLLMResponse(response: string | InferClassificationUnion<T>, session: Session) {
    let parsedResponse: InferClassificationUnion<T> | string;
    if (typeof response === 'string') {
      try {
        // Only try to parse as JSON if it looks like JSON
        if (response.trim().startsWith('{') || response.trim().startsWith('[')) {
          parsedResponse = JSON.parse(response);
        } else {
          // Plain text - pass directly to classifier
          this.core.log(session.sessionId, 'Response appears to be plain text, passing directly to classifier');
          parsedResponse = response;
        }
      } catch (error) {
        // Even on parse error, pass the response to the classifier
        // Don't block text responses just because they're not valid JSON
        this.core.log(session.sessionId, `Not valid JSON, passing as plain text: ${error}`);
        parsedResponse = response;
      }
    } else {
      parsedResponse = response;
    }
    this.classifier.handleLLMResponse(parsedResponse, session);
  }

  public isStreamingEnabled(): boolean {
    return this.core.llmConfig?.streamMode === true;
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
    return this.core.getSessionContext(sessionId).getSession();
  }   

  private async findHelperAgent(subtask: string): Promise<AgentCore | null> {
    console.log('findHelperAgent called with subtask:', subtask);
    const agent = await AgentRegistry.getInstance().findAgentByCapabilities(subtask);
    return agent;
  }

}
