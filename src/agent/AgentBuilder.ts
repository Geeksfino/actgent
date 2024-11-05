import { BaseAgent } from './BaseAgent';
import { AgentCoreConfig, AgentServiceConfig } from '../core/configs';
import { ReActPromptTemplate } from './ReActPromptTemplate';
import { ReActClassifier } from './ReActClassifier';
import { ClassificationTypeConfig } from '../core/IClassifier';
import { SchemaBuilder } from './SchemaBuilder';
import { ExecutionContext } from '../core/ExecutionContext';
import { ReActModeStrategy, KeywordBasedStrategy } from './ReActModeStrategy';

export class AgentBuilder {
  private coreConfig: AgentCoreConfig;
  private serviceConfig: AgentServiceConfig;
  private context: ExecutionContext;
  private promptStrategy: ReActModeStrategy;

  constructor(
    coreConfig: AgentCoreConfig, 
    serviceConfig: AgentServiceConfig,
    promptStrategy: ReActModeStrategy = new KeywordBasedStrategy()
  ) {
    this.coreConfig = coreConfig;
    this.serviceConfig = serviceConfig;
    this.context = ExecutionContext.getInstance(); // Default context
    this.promptStrategy = promptStrategy;
  }

  public withContext(context: ExecutionContext): AgentBuilder {
    this.context = context;
    return this;
  }

  public withPromptStrategy(strategy: ReActModeStrategy): AgentBuilder {
    this.promptStrategy = strategy;
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

    // Create a dynamic subclass of BaseAgent
    class DynamicAgent extends BaseAgent<Readonly<T>, ReActClassifier<Readonly<T>>, ReActPromptTemplate<Readonly<T>>> {
      private readonly promptStrategy: ReActModeStrategy;

      constructor(
        coreConfig: AgentCoreConfig, 
        serviceConfig: AgentServiceConfig,
        context: ExecutionContext,
        promptStrategy: ReActModeStrategy
      ) {
        super(coreConfig, serviceConfig, schemaTypes);
        this.setExecutionContext(context);
        this.promptStrategy = promptStrategy;
      }

      protected useClassifierClass(): new () => ReActClassifier<Readonly<T>> {
        return class extends ReActClassifier<Readonly<T>> {
          constructor() {
            super(schemaTypes);
          }
        };
      }

      protected usePromptTemplateClass(): new (classificationTypes: Readonly<T>) => ReActPromptTemplate<Readonly<T>> {
        const strategy = this.promptStrategy; // Capture the strategy in a closure
        return class extends ReActPromptTemplate<Readonly<T>> {
          constructor(classificationTypes: Readonly<T>) {
            super(classificationTypes, strategy);
          }
        };
      }
    }

    // Set the name of the class
    Object.defineProperty(DynamicAgent, 'name', { value: className });

    // Instantiate the dynamic subclass with context and strategy
    return new DynamicAgent(
      this.coreConfig, 
      this.serviceConfig, 
      this.context,
      this.promptStrategy
    );
  }
}
