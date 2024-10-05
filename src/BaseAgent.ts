import { AgentCoreConfig, Tool, LLMConfig, CommunicationConfig, MemoryConfig, CapabilityDescription, Session, AgentServiceConfig  } from './interfaces';
import { Communication } from './Communication';
import { AgentRegistry } from './AgentRegistry';
import { AgentCore } from './AgentCore';
import { ClassificationTypeConfig } from './IAgentPromptTemplate';
import { Message } from './Message';
import { InferClassificationUnion, InferClassificationType } from './TypeInference';  

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
  goal: 'Creating functional specifications for developers to implement',
  capabilities: [{ name: 'UX', description: 'Design user interaction for the product' },
    { name: 'UI', description: 'Design the user interface for the product' },
    { name: 'Planning', description: 'Create functional specifications for the product' },
  ],
  classificationTypeConfigs: defaultTypes,
};

const svcConfig = {
  llmConfig: {
    apiKey: "",
    model: "qwen2",
    baseUrl: "",
  }
}

type BasicClassification = InferClassificationUnion<typeof defaultTypes>;

export class BaseAgent  {
  private core: AgentCore;
  
  constructor(core_config: AgentCoreConfig, svc_config: AgentServiceConfig) {
    // Ensure llmConfig is defined, or provide a default value
    const llmConfig = svc_config.llmConfig;
    this.core = new AgentCore(core_config, llmConfig!);
    this.core.addLLMResponseHandler(this.handleLLMResponse.bind(this));
  }

  public static getInstance(svc_config: AgentServiceConfig): BaseAgent {
    return new BaseAgent(coreConfig, svc_config);
  }

  public async run() {
    this.core.start();
  }

  public async createSession(owner: string, description: string): Promise<Session> {
    return await this.core.createSession(owner, description);
  }

  private handleLLMResponse(response: any, message: Message) {
    const result = JSON.parse(response) as BasicClassification;
    console.log("BaseAgent.handleLLMResponse:\n");
    switch (result.messageType) {
      case 'SIMPLE_QUERY':
        console.log(result.answer);
        break;
      case 'COMPLEX_TASK':
        console.log("complex task:\n")
        console.log(result.actionPlan.task);
        console.log(result.actionPlan.subtasks);
        break;
      case 'CLARIFICATION_NEEDED':
        console.log(result.questions);
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
