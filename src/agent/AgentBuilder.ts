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

  public create(): BaseAgent<Readonly<ClassificationTypeConfig[]>, ReActClassifier<Readonly<ClassificationTypeConfig[]>>, ReActPromptTemplate<Readonly<ClassificationTypeConfig[]>>> {
    const schemaBuilder = new SchemaBuilder(this.coreConfig.instructions || []);
    const schemaTypes = schemaBuilder.build();
    return this.build(this.coreConfig.name, schemaTypes);
  }

  public build<T extends ClassificationTypeConfig[]>(
    className: string,
    schemaTypes: T
  ): BaseAgent<Readonly<T>, ReActClassifier<Readonly<T>>, ReActPromptTemplate<Readonly<T>>> {
    type SchemaTypes = Readonly<T>;

    const builderStrategy = this.promptStrategy;
    const streamParser = this.streamParser;

    class DynamicAgent extends BaseAgent<SchemaTypes, ReActClassifier<SchemaTypes>, ReActPromptTemplate<SchemaTypes>> {
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

        // Set up stream callback if stream parser exists
        if (streamParser) {
          const callback = (chunk: string) => {
            streamParser.processChunk(chunk);
          };
          this.core.registerStreamCallback(callback);
        }
      }

      protected useClassifierClass(): new () => ReActClassifier<SchemaTypes> {
        return class extends ReActClassifier<SchemaTypes> {
          constructor() {
            super(schemaTypes);
          }
        };
      }

      protected usePromptTemplateClass(): new (classificationTypes: SchemaTypes) => ReActPromptTemplate<SchemaTypes> {
        const strategy = builderStrategy;
        return class extends ReActPromptTemplate<SchemaTypes> {
          constructor(classificationTypes: SchemaTypes) {
            super(classificationTypes, strategy);
          }
        };
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
