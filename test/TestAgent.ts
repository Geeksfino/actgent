import { BaseAgent } from '../src/BaseAgent';
import { AgentCoreConfig, AgentServiceConfig } from '../src/interfaces';
import { DefaultPromptTemplate } from '../src/DefaultPromptTemplate';
import { DefaultClassifier } from '../src/DefaultClassifier';
import { ClassificationTypeConfig } from '../src/IClassifier';

const defaultTypes = [
  {
    name: "SIMPLE_QUERY",
    prompt: "A straightforward question that can be answered directly.",
    schema: {
      answer: "<DIRECT_ANSWER_TO_QUERY>",
    },
  },
  {
    name: "COMPLEX_TASK",
    prompt: "A task that requires multiple steps or extended processing.",
    schema: {
      actionPlan: {
        task: "<MAIN_OBJECTIVE>",
        subtasks: ["<SUBTASK_1>", "<SUBTASK_2>", "..."],
      },
    },
  },
  {
    name: "CLARIFICATION_NEEDED",
    prompt: "The message needs clarification.",
    schema: {
      questions: ["<QUESTION_1>", "<QUESTION_2>", "..."],
    },
  },
  {
    name: "COMMAND",
    prompt: "An instruction to perform a specific action.",
    schema: {
      command: {
        action: "<SPECIFIC_ACTION>",
        parameters: {
          "<PARAM_1>": "<VALUE_1>",
          "<PARAM_2>": "<VALUE_2>",
          "...": "...",
        },
        expectedOutcome: "<DESCRIPTION_OF_EXPECTED_RESULT>",
      },
    },
  },
] as const; // 'as const' ensures immutability

export type SchemaTypes = typeof defaultTypes;

export class TestAgent extends BaseAgent<SchemaTypes, DefaultClassifier<SchemaTypes>, DefaultPromptTemplate<SchemaTypes>> {
  constructor(core_config: AgentCoreConfig, svc_config: AgentServiceConfig, schemaTypes: SchemaTypes = defaultTypes) {
    super(core_config, svc_config, schemaTypes);
  }

  protected useClassifierClass(): new () => DefaultClassifier<SchemaTypes> {
    return class extends DefaultClassifier<SchemaTypes> {
      constructor() {
        super(defaultTypes);
      }
    };
  }

  protected usePromptTemplateClass(): new (classificationTypes: SchemaTypes) => DefaultPromptTemplate<SchemaTypes> {
    return DefaultPromptTemplate;
  }
}
