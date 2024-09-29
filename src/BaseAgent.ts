import { AgentConfig, Tool, LLMConfig, CommunicationConfig, MemoryConfig, CapabilityDescription, Session  } from './interfaces';
import { Communication } from './Communication';
import { DefaultAgentMemory, Memory } from './Memory';
import { PromptManager } from './PromptManager';
import { PriorityInbox } from './PriorityInbox';
import { Message } from './Message';
import { SessionContext } from './SessionContext';
import { AgentRegistry } from './AgentRegistry';
import { AgentCore } from './AgentCore';


const defaultCommunicationConfig: CommunicationConfig = {};

export class BaseAgent {
  public communication: Communication;
  private core: AgentCore;
  

  constructor(config: AgentConfig) {
    this.core = new AgentCore(config);
    this.communication = new Communication(config.communicationConfig || defaultCommunicationConfig);
  }


  private async findHelperAgent(subtask: string): Promise<AgentCore | null> {
    console.log('findHelperAgent called with subtask:', subtask);
    const agent = await AgentRegistry.getInstance().findAgentByCapabilities(subtask); // Find agent using registry
    return agent;
  }
}