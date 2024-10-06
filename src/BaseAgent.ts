import { AgentCoreConfig, Tool, LLMConfig, CommunicationConfig, AgentServiceConfig  } from './interfaces';
import { Communication } from './Communication';
import { AgentRegistry } from './AgentRegistry';
import { AgentCore } from './AgentCore';
import { ClassificationTypeConfig, IAgentPromptTemplate } from './IAgentPromptTemplate';
import { Message } from './Message';
import { InferClassificationUnion, InferClassificationType } from './TypeInference';  
import { Session } from './Session';
import { GenericPromptTemplate } from './GenericPromptTemplate';

const defaultCommunicationConfig: CommunicationConfig = {};

const defaultTypes: ClassificationTypeConfig[] = [
  {
    name: 'SIMPLE_QUERY',
    description: 'A straightforward question that can be answered directly.',
    structure: {
      answer: '<DIRECT_ANSWER_TO_QUERY>'
    }
  },
  {
    name: 'COMPLEX_TASK',
    description: 'A task that requires multiple steps or extended processing.',
    structure: {
      actionPlan: {
        task: '<MAIN_OBJECTIVE>',
        subtasks: ['<SUBTASK_1>', '<SUBTASK_2>', '...']
      }
    }
  },
  {
    name: 'CLARIFICATION_NEEDED',
    description: 'The message needs clarification.',
    structure: {
      questions: ['<QUESTION_1>', '<QUESTION_2>', '...']
    }
  },
  {
    name: 'COMMAND',
    description: 'An instruction to perform a specific action.',
    structure: {
      command: {
        action: '<SPECIFIC_ACTION>',
        parameters: {
          '<PARAM_1>': '<VALUE_1>',
          '<PARAM_2>': '<VALUE_2>',
          '...': '...'
        },
        expectedOutcome: '<DESCRIPTION_OF_EXPECTED_RESULT>'
      }
    }
  }
] as const;

const coreConfig = {
  name: "BaseAgent",
  role: "Assistant",
  goal: 'testing',
  capabilities: 'assist in testing',
  classificationTypeConfigs: defaultTypes,
};

type BasicClassification = InferClassificationUnion<typeof defaultTypes>;

export abstract class BaseAgent<T extends IAgentPromptTemplate>  {
  private core!: AgentCore;
  
  protected abstract usePromptTemplateClass(): new (...args: any[]) => T;

  // A method to create an instance using the class type returned by "useClass"
  public createPromptTemplate(...args: any[]): T {
    const ClassToInstantiate = this.usePromptTemplateClass();
    return new ClassToInstantiate(...args);
  }

  constructor(core_config: AgentCoreConfig, svc_config: AgentServiceConfig) {
    console.log("BaseAgent constructor");
    this.init(core_config, svc_config);
  }

  protected init(core_config: AgentCoreConfig, svc_config: AgentServiceConfig) {
    const llmConfig = svc_config.llmConfig;
    const promptTemplate = this.createPromptTemplate(defaultTypes);

    this.core = new AgentCore(core_config, llmConfig!, promptTemplate);
    this.core.addLLMResponseHandler(this.handleLLMResponse.bind(this));
  }

  public async run() {
    this.core.start();
  }

  public async createSession(owner: string, description: string): Promise<Session> {
    return await this.core.createSession(owner, description);
  }

  protected getPromptTemplate(): IAgentPromptTemplate {
    return new GenericPromptTemplate(coreConfig.classificationTypeConfigs);
  }

  protected handleLLMResponse(response: any, session: Session) {
    const result = JSON.parse(response) as BasicClassification;
    console.log("BaseAgent.handleLLMResponse:\n");
    switch (result.messageType) {
      case 'SIMPLE_QUERY':
        //console.log(result.answer);
        //session.onResponse(result.answer);
        session.triggerHandleResult(result.answer);
        break;
      case 'COMPLEX_TASK':
        console.log("complex task:\n")
        console.log(result.actionPlan.task);
        console.log(result.actionPlan.subtasks);
        result.actionPlan.subtasks.forEach(async (subtask: string) => {
          const message = new Message(session.sessionId, subtask);
          await this.core.receive(message);
        });
        break;
      case 'CLARIFICATION_NEEDED':
        console.log(result.questions);
        session.triggerClarificationNeeded(result.questions);
        break;
      case 'COMMAND':
        console.log(result.command.action);
        console.log(result.command.parameters);
        console.log(result.command.expectedOutcome);
        break;
    }
  }
  private async findHelperAgent(subtask: string): Promise<AgentCore | null> {
    console.log('findHelperAgent called with subtask:', subtask);
    const agent = await AgentRegistry.getInstance().findAgentByCapabilities(subtask); // Find agent using registry
    return agent;
  }
}
