import { BaseAgent } from '../src/BaseAgent';
import { AgentCoreConfig, AgentServiceConfig } from '../src/interfaces';
import GenericPromptTemplate from '../src/DefaultPromptTemplate';
import { DefaultClassifier, SchemaTypes } from '../src/DefaultClassifier';

export class TestAgent extends BaseAgent<SchemaTypes, DefaultClassifier, GenericPromptTemplate<SchemaTypes>> {
  constructor(core_config: AgentCoreConfig, svc_config: AgentServiceConfig) {
    super(core_config, svc_config);
  }

  protected useClassifierClass(): new () => DefaultClassifier {
    return DefaultClassifier;
  }

  protected usePromptTemplateClass(): new (classificationTypes: SchemaTypes) => GenericPromptTemplate<SchemaTypes> {
    return GenericPromptTemplate;
  }
}
