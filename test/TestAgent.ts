import { AgentRegistry } from '../src/AgentRegistry';
import { BaseAgent } from '../src/BaseAgent';
import { AgentCoreConfig, AgentServiceConfig } from '../src/interfaces';
import { IAgentPromptTemplate } from '../src/IAgentPromptTemplate';
import { GenericPromptTemplate } from '../src/GenericPromptTemplate';
import { InferClassificationUnion } from '../src/TypeInference';
import { ClassificationTypeConfig, ClassifiedTypeHandlers, IClassifier } from '../src/IClassifier';
import { DefaultClassifier, DefaultTypes } from '../src/DefaultClassifier';

export class TestAgent extends BaseAgent<DefaultTypes, DefaultClassifier, GenericPromptTemplate<DefaultTypes>> {
  constructor(core_config: AgentCoreConfig, svc_config: AgentServiceConfig) {
    super(core_config, svc_config);
  }

  protected useClassifierClass(): new () => IClassifier<DefaultTypes> {
    return DefaultClassifier;
  }

  protected usePromptTemplateClass(): new (classificationTypes: DefaultTypes) => GenericPromptTemplate<DefaultTypes> {
    return GenericPromptTemplate;
  }
}
