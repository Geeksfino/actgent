import { BaseAgent } from './BaseAgent';
import { AgentCoreConfig, AgentServiceConfig } from '../core/configs';
import { ReActPromptTemplate } from './ReActPromptTemplate';
import { ReActClassifier } from './ReActClassifier';
import { ClassificationTypeConfig } from '../core/IClassifier';
import { SchemaBuilder } from './SchemaBuilder';
import { ExecutionContext } from '../core/ExecutionContext';
import { KeywordBasedStrategy } from './ReActModeStrategy';
import { InferStrategy } from '../core/InferContext';
import { ReActLLMResponseStreamParser } from './ReActLLMResponseStreamParser';
import { getEventEmitter } from '../core/observability/AgentEventEmitter';
import { AbstractClassifier } from '../core/AbstractClassifier';
import { IAgentPromptTemplate } from '../core/IPromptTemplate';
import { McpConfigurator } from '../helpers/McpConfigurator';

export class AgentBuilder {
  private coreConfig: AgentCoreConfig;
  private serviceConfig: AgentServiceConfig;
  private context: ExecutionContext;
  private promptStrategy: InferStrategy;
  private streamParser: ReActLLMResponseStreamParser | undefined;
  private mcpConfigPath: string | undefined;

  constructor(
    coreConfig: AgentCoreConfig, 
    serviceConfig: AgentServiceConfig,
    promptStrategy?: InferStrategy
  ) {
    this.coreConfig = coreConfig;
    this.serviceConfig = serviceConfig;
    this.context = ExecutionContext.getInstance();
    this.promptStrategy = promptStrategy ?? new KeywordBasedStrategy();
  }

  public withContext(context: ExecutionContext): AgentBuilder {
    this.context = context;
    return this;
  }

  public withPromptStrategy(strategy: InferStrategy): AgentBuilder {
    this.promptStrategy = strategy;
    return this;
  }

  public withDefaultReActStrategy(): AgentBuilder {
    this.promptStrategy = new KeywordBasedStrategy();
    return this;
  }

  public withStreamObservability(): AgentBuilder {
    this.streamParser = new ReActLLMResponseStreamParser();
    // Initialize event emitter
    getEventEmitter().initialize();
    return this;
  }

  /**
   * Adds MCP tools to the agent from a configuration file
   * @param configPath Optional path to the MCP configuration file (defaults to ./mcp_config.json)
   * @returns This builder instance for method chaining
   */
  public withMcpTools(configPath?: string): AgentBuilder {
    // Store the config path to use when the agent is created
    this.mcpConfigPath = configPath;
    return this;
  }

  // Default ReAct implementation
  public create(): BaseAgent<readonly ClassificationTypeConfig[], ReActClassifier<readonly ClassificationTypeConfig[]>, ReActPromptTemplate<readonly ClassificationTypeConfig[]>>;
  
  // Custom implementation with type inference
  public create<T extends readonly ClassificationTypeConfig[]>(
    ClassifierClass: new (types: T) => AbstractClassifier<T>,
    PromptTemplateClass: new (types: T, strategy: InferStrategy) => IAgentPromptTemplate
  ): BaseAgent<T, AbstractClassifier<T>, IAgentPromptTemplate>;
  
  // Implementation
  public create<T extends readonly ClassificationTypeConfig[]>(
    ClassifierClass?: new (types: T) => AbstractClassifier<T>,
    PromptTemplateClass?: new (types: T, strategy: InferStrategy) => IAgentPromptTemplate
  ) {
    const schemaBuilder = new SchemaBuilder(this.coreConfig.instructions || []);
    const schemaTypes = schemaBuilder.build();  // Returns readonly ClassificationTypeConfig[]

    if (!ClassifierClass || !PromptTemplateClass) {
      return this.build(
        this.coreConfig.name,
        schemaTypes,
        ReActClassifier,
        ReActPromptTemplate
      );
    }

    return this.build(
      this.coreConfig.name,
      schemaTypes as T,  // Safe assertion since T extends readonly ClassificationTypeConfig[]
      ClassifierClass,
      PromptTemplateClass
    );
  }

  public build<
    T extends readonly ClassificationTypeConfig[],
    C extends AbstractClassifier<T>,
    P extends IAgentPromptTemplate
  >(
    className: string,
    schemaTypes: T,
    ClassifierClass: new (types: T) => C,
    PromptTemplateClass: new (types: T, strategy: InferStrategy) => P
  ): BaseAgent<T, C, P> {
    const builderStrategy = this.promptStrategy;
    const streamParser = this.streamParser;

    class DynamicAgent extends BaseAgent<T, C, P> {
      private readonly promptStrategy: InferStrategy;

      constructor(
        coreConfig: AgentCoreConfig, 
        serviceConfig: AgentServiceConfig,
        context: ExecutionContext,
        promptStrategy: InferStrategy
      ) {
        super(coreConfig, serviceConfig, schemaTypes);
        this.setExecutionContext(context);
        this.promptStrategy = promptStrategy;

        if (streamParser) {
          const callback = (chunk: string) => {
            streamParser.processChunk(chunk);
          };
          this.core.registerStreamCallback(callback);
        }
      }

      protected useClassifierClass(): new () => C {
        const boundClass = function(this: any) {
          return new ClassifierClass(schemaTypes);
        };
        return boundClass as unknown as new () => C;
      }

      protected usePromptTemplateClass(): new (types: T) => P {
        const strategy = builderStrategy;
        const boundClass = function(this: any, types: T) {
          return new PromptTemplateClass(types, strategy);
        };
        return boundClass as unknown as new (types: T) => P;
      }
    }

    Object.defineProperty(DynamicAgent, 'name', { value: className });

    const agent = new DynamicAgent(
      this.coreConfig, 
      this.serviceConfig, 
      this.context,
      this.promptStrategy
    );
    
    // Register MCP tools if enabled
    if (this.mcpConfigPath !== undefined) {
      // We need to use Promise.resolve here since the build method is not async
      // The actual registration will happen asynchronously
      Promise.resolve().then(async () => {
        await this.registerMcpTools(agent, this.mcpConfigPath);
      }).catch(error => {
        console.error('Non-fatal error registering MCP tools:', error);
      });
    }
    
    return agent;
  }

  /**
   * Registers MCP tools with the agent
   * 
   * This method loads all individual tools from all MCP servers defined in the configuration file
   * and registers them with the agent. Each tool has its actual name and description from the MCP
   * server, making it identifiable to the LLM for tool selection based on the task.
   * 
   * @param agent The agent to register tools with
   * @param configPath Optional path to the MCP configuration file
   * @private
   */
  private async registerMcpTools<T extends readonly ClassificationTypeConfig[], C extends AbstractClassifier<T>, P extends IAgentPromptTemplate>(
    agent: BaseAgent<T, C, P>,
    configPath?: string
  ): Promise<void> {
    try {
      // This loads individual tools from all MCP servers, each tool already has a reference to its client
      const mcpTools = await McpConfigurator.loadTools(configPath);
      
      if (mcpTools.length > 0) {
        console.log(`Registering ${mcpTools.length} MCP tools with agent`);
        
        for (const tool of mcpTools) {
          agent.registerTool(tool);
        }
      } else {
        console.warn('No MCP tools found to register');
      }
    } catch (error) {
      // Never let MCP tool registration failures affect the agent
      console.warn('Non-fatal error registering MCP tools:', error);
    }
  }
}
