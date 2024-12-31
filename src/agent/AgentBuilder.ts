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

export class AgentBuilder {
  private coreConfig: AgentCoreConfig;
  private serviceConfig: AgentServiceConfig;
  private context: ExecutionContext;
  private promptStrategy: InferStrategy;
  private streamParser: ReActLLMResponseStreamParser | undefined;

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

  public create(): BaseAgent<ClassificationTypeConfig[], ReActClassifier<ClassificationTypeConfig[]>, ReActPromptTemplate<ClassificationTypeConfig[]>>;
  public create<
    C extends AbstractClassifier<any>,
    P extends IAgentPromptTemplate
  >(
    ClassifierClass: new (...args: any[]) => C,
    PromptTemplateClass: new (...args: any[]) => P
  ): BaseAgent<any, C, P>;
  public create<
    C extends AbstractClassifier<any>,
    P extends IAgentPromptTemplate
  >(
    ClassifierClass?: new (...args: any[]) => C,
    PromptTemplateClass?: new (...args: any[]) => P
  ): BaseAgent<any, C | ReActClassifier<any>, P | ReActPromptTemplate<any>> {
    const schemaBuilder = new SchemaBuilder(this.coreConfig.instructions || []);
    const schemaTypes = schemaBuilder.build();

    if (!ClassifierClass || !PromptTemplateClass) {
      return this.build(
        this.coreConfig.name,
        schemaTypes,
        ReActClassifier,
        ReActPromptTemplate
      ) as BaseAgent<any, ReActClassifier<any>, ReActPromptTemplate<any>>;
    }

    return this.build(
      this.coreConfig.name,
      schemaTypes,
      ClassifierClass,
      PromptTemplateClass
    );
  }

  private build<
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

    return new DynamicAgent(
      this.coreConfig, 
      this.serviceConfig, 
      this.context,
      this.promptStrategy
    );
  }
}
