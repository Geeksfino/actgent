import { BaseAgent } from './BaseAgent';
import { AgentCoreConfig, AgentServiceConfig } from '../core/configs';
import { DefaultPromptTemplate } from './ReActPromptTemplate';
import { ReActClassifier } from './ReActClassifier';
import { ClassificationTypeConfig } from '../core/IClassifier';
import { SchemaBuilder } from './SchemaBuilder';

export class AgentBuilder {
  private coreConfig: AgentCoreConfig;
  private serviceConfig: AgentServiceConfig;

  constructor(coreConfig: AgentCoreConfig, serviceConfig: AgentServiceConfig) {
    this.coreConfig = coreConfig;
    this.serviceConfig = serviceConfig;
  }

  public create(): BaseAgent<Readonly<ClassificationTypeConfig[]>, ReActClassifier<Readonly<ClassificationTypeConfig[]>>, DefaultPromptTemplate<Readonly<ClassificationTypeConfig[]>>> {
    const schemaBuilder = new SchemaBuilder(this.coreConfig.instructions || []);
    const schemaTypes = schemaBuilder.build();
    return this.build(this.coreConfig.name, schemaTypes);
  }

  public build<T extends ClassificationTypeConfig[]>(
    className: string,
    schemaTypes: T
  ): BaseAgent<Readonly<T>, ReActClassifier<Readonly<T>>, DefaultPromptTemplate<Readonly<T>>> {

    type SchemaTypes = Readonly<T>;
    type SchemaTypesType = T[number];

    // Create a dynamic subclass of BaseAgent
    class DynamicAgent extends BaseAgent<Readonly<T>, ReActClassifier<Readonly<T>>, DefaultPromptTemplate<Readonly<T>>> {
      constructor(coreConfig: AgentCoreConfig, serviceConfig: AgentServiceConfig) {
        super(coreConfig, serviceConfig, schemaTypes);
      }

      protected useClassifierClass(): new () => ReActClassifier<Readonly<T>> {
        return class extends ReActClassifier<Readonly<T>> {
          constructor() {
            super(schemaTypes);
          }
        };
      }

      protected usePromptTemplateClass(): new (classificationTypes: Readonly<T>) => DefaultPromptTemplate<Readonly<T>> {
        return DefaultPromptTemplate;
      }
    }

    // Set the name of the class
    Object.defineProperty(DynamicAgent, 'name', { value: className });

    // Instantiate the dynamic subclass
    return new DynamicAgent(this.coreConfig, this.serviceConfig) as BaseAgent<SchemaTypes, ReActClassifier<SchemaTypes>, DefaultPromptTemplate<SchemaTypes>>;
  }
}
