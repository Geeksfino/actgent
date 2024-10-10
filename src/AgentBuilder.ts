import { BaseAgent } from './BaseAgent';
import { AgentCoreConfig, AgentServiceConfig } from './interfaces';
import { DefaultPromptTemplate } from './DefaultPromptTemplate';
import { DefaultClassifier } from './DefaultClassifier';
import { ClassificationTypeConfig } from './IClassifier';

export class AgentBuilder {
  private coreConfig: AgentCoreConfig;
  private serviceConfig: AgentServiceConfig;

  constructor(coreConfig: AgentCoreConfig, serviceConfig: AgentServiceConfig) {
    this.coreConfig = coreConfig;
    this.serviceConfig = serviceConfig;
  }

  public build<T extends ClassificationTypeConfig[]>(
    className: string,
    schemaTypes: T
  ): BaseAgent<Readonly<T>, DefaultClassifier<Readonly<T>>, DefaultPromptTemplate<Readonly<T>>> {

    type SchemaTypes = Readonly<T>;
    type SchemaTypesType = T[number];

    // Create a dynamic subclass of BaseAgent
    class DynamicAgent extends BaseAgent<Readonly<T>, DefaultClassifier<Readonly<T>>, DefaultPromptTemplate<Readonly<T>>> {
      constructor(coreConfig: AgentCoreConfig, serviceConfig: AgentServiceConfig) {
        super(coreConfig, serviceConfig, schemaTypes);
      }

      protected useClassifierClass(): new () => DefaultClassifier<Readonly<T>> {
        return class extends DefaultClassifier<Readonly<T>> {
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
    return new DynamicAgent(this.coreConfig, this.serviceConfig) as BaseAgent<SchemaTypes, DefaultClassifier<SchemaTypes>, DefaultPromptTemplate<SchemaTypes>>;
  }
}
