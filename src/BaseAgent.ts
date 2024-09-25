import { AgentConfig, Tool, LLMConfig, CommunicationConfig, MemoryConfig, CapabilityDescription } from './interfaces';
import { Communication } from './Communication';
import { Memory } from './Memory';
import { PromptManager } from './PromptManager';
import { PriorityInbox } from './PriorityInbox';
import { Message } from './Message';
import { AgentRegistry } from './AgentRegistry';
import { interval, from } from 'rxjs';
import { switchMap } from 'rxjs/operators';

const defaultMemoryConfig: MemoryConfig = {
  type: 'sqlite',
  dbFilePath: 'agent.db',
};

const defaultCommunicationConfig: CommunicationConfig = {};

const basePromptLibrary = {
  "decompose_task": {
    id: "decompose_task",
    template: "System: {goal}\nTask: {task}\nDecompose this task into subtasks.",
    description: "Asks the LLM to decompose a given task into smaller subtasks."
  },
  "multi_round_chat": {
    id: "multi_round_chat",
    template: "Message: {message}\nEngage in a conversation until the task is clarified or resolved.",
    description: "Handles multi-round conversations with other agents or LLM until a subtask is resolved."
  },
  "goal_completion": {
    id: "goal_completion",
    template: "System: {goal}\nHas the goal been achieved? Respond with Yes or No.",
    description: "Asks the LLM whether the specified goal has been achieved."
  },
  "clarification": {
    id: "clarification",
    template: "Message: {message}\nClarify the task or resolve ambiguities over multiple rounds of conversation.",
    description: "Clarifies a given message or instruction in a multi-round conversation."
  },
  "generic_task": {
    id: "generic_task",
    template: "Task: {task}\nPlease provide insights, steps, or advice to complete this task.",
    description: "Handles generic task-based interaction with the LLM."
  },
  "local_task_completion": {
    id: "local_task_completion",
    template: "Subtask: {subtask}\nProvide any necessary steps or advice to complete this subtask.",
    description: "Helps the agent complete a subtask locally by interacting with the LLM for guidance."
  },
  "proactive_action": {
    id: "proactive_action",
    template: "Current context: {context}\nWhat proactive action should the agent take next?",
    description: "Asks the LLM what proactive steps the agent should take based on the current context."
  }
};


export class BaseAgent {
  public id: string;
  public name: string;
  public goal: string;
  public communication: Communication;
  public capabilities: CapabilityDescription[];
  private inbox: PriorityInbox;
  private memory: Memory;
  private tools: { [key: string]: Tool };
  private promptManager: PromptManager;
  private llmConfig: LLMConfig | null;
  private memoryCache: { [key: string]: any } = {};
  private isProxy: boolean = false;
  private isNetworkService: boolean;

  constructor(config: AgentConfig) {
    console.log('BaseAgent constructor called');
    this.id = ""; // No id until registered
    this.name = config.name;
    this.capabilities = config.capabilities;
    this.memory = new Memory(config.memoryConfig || defaultMemoryConfig);
    this.tools = config.tools || {};
    this.goal = config.goal || "";
    this.communication = new Communication(config.communicationConfig || defaultCommunicationConfig);
    this.llmConfig = config.llmConfig || null;
    this.promptManager = new PromptManager(config.promptLibrary || basePromptLibrary);
    this.inbox = new PriorityInbox();
    this.isProxy = false;
    this.isNetworkService = config.isNetworkService || false;
    this.initializeAgent(config);
  }

  private initializeAgent(config: AgentConfig): void {
    console.log('initializeAgent called');
    if (this.isNetworkService) {
      // Set up message handling for network service
      this.communication.onMessage = this.handleIncomingMessage.bind(this);
    }

    // Set up RxJS interval to check the inbox
    interval(1000).pipe(
      switchMap(() => from(this.checkPriorityInbox()))
    ).subscribe({
      next: (result) => console.log(result),
      error: (err) => console.error('Error:', err),
      complete: () => console.log('Completed')
    });
  }

  private async checkPriorityInbox(): Promise<string> {
    console.log('Checking priority inbox...');
    // Your logic to check the priority inbox
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve('Inbox checked');
        const message = this.inbox.dequeue();
        if (message) {
          this.processMessage(message);
        }
      }, 1000); // Simulate async operation
    });
  }

  private handleIncomingMessage(message: Message): void {
    console.log('handleIncomingMessage called with message:', message);
    console.log("Received incoming message:", message);
    this.sendTask(message.payload.input);
  }

  public async processMessage(message: Message): Promise<void> {
    console.log('processMessage called with message:', message);
    
    const subtasks = await this.decomposeTask(message.payload.input);
    for (const subtask of subtasks) {
      await this.handleSubtask(subtask);
    }
    await this.checkGoalAchievement();
  }

  private async decomposeTask(task: string): Promise<string[]> {
    console.log('decomposeTask called with task:', task);
    const prompt = this.promptManager.renderPrompt("decompose_task", { goal: this.goal, task });
    const response = await this.interactWithLLM("decompose_task", { goal: this.goal, task });
    return response.split('\n');
  }

  private async handleSubtask(subtask: string): Promise<void> {
    console.log('handleSubtask called with subtask:', subtask);
    const helperAgent = await this.findHelperAgent(subtask);
    if (helperAgent) {
      await helperAgent.chat(subtask); // Use chat for multi-round conversation with helper agent
    } else {
      await this.completeSubtaskLocally(subtask);
    }
  }

  private async findHelperAgent(subtask: string): Promise<BaseAgent | null> {
    console.log('findHelperAgent called with subtask:', subtask);
    return await AgentRegistry.getInstance().findAgentByCapabilities(subtask); // Find agent using registry
  }

  getCapabilities(): CapabilityDescription[] {
    return this.capabilities;
  }

  // Implementing multi-round chat with another agent
  public async chat(message: string): Promise<void> {
    console.log('chat called with message:', message);
    const maxRounds = 5; // Limit the number of conversation rounds
    let round = 0;
    let currentMessage = message;

    while (round < maxRounds) {
      console.log(`Round ${round + 1}: Initiating chat with agent`);
      const response = await this.interactWithLLM("multi_round_chat", { message: currentMessage });
      console.log(`Received response from agent: ${response}`);
      currentMessage = this.processResponse(response);
      round++;
      
      // If the conversation ends (based on response), break early
      if (this.isConversationOver(response)) break;
    }
  }

  private processResponse(response: string): string {
    console.log('processResponse called with response:', response);
    // Process the received response and return the next message
    return `Processed response: ${response}`;
  }

  private isConversationOver(response: string): boolean {
    console.log('isConversationOver called with response:', response);
    // Logic to determine if the conversation has ended
    return response.includes("Task completed") || response.includes("No further actions");
  }

  private async completeSubtaskLocally(subtask: string): Promise<void> {
    console.log('completeSubtaskLocally called with subtask:', subtask);
    // Implement local subtask completion logic
    console.log(`Completing subtask locally: ${subtask}`);
  }

  private async checkGoalAchievement(): Promise<void> {
    console.log('checkGoalAchievement called');
    const prompt = this.promptManager.renderPrompt("goal_completion", { goal: this.goal });
    const response = await this.interactWithLLM("goal_completion", { goal: this.goal });
    if (response.toLowerCase() === 'no') {
      // Implement retry or further decomposition logic
    }
  }

  public async interactWithLLM(promptName: string, variables: { [key: string]: string }): Promise<string> {
    console.log('interactWithLLM called with promptName:', promptName, 'and variables:', variables);
    const cacheKey = `${promptName}-${JSON.stringify(variables)}`;
    const cachedResponse = await this.getFromMemory(cacheKey);
    if (cachedResponse) return cachedResponse;

    const renderedPrompt = this.promptManager.renderPrompt(promptName, variables);
    const response = await this.callLLM(renderedPrompt);
    await this.saveToMemory(cacheKey, response);

    return response;
  }

  private async callLLM(prompt: string): Promise<string> {
    console.log('callLLM called with prompt:', prompt);
    console.log(`Interacting with LLM using prompt: ${prompt}`);
    return "LLM response placeholder";
  }

  public async saveToMemory(key: string, value: any): Promise<void> {
    console.log('saveToMemory called with key:', key, 'and value:', value);
    this.memoryCache[key] = value;
  }

  public async getFromMemory(key: string): Promise<any> {
    console.log('getFromMemory called with key:', key);
    return this.memoryCache[key];
  }

  public scheduleProactivity(interval: string): void {
    console.log('scheduleProactivity called with interval:', interval);
    // Implement proactivity scheduling if needed
  }

  public async sendTask(task: string): Promise<void> {
    console.log('sendTask called with task:', task);
    const message = new Message(task);
    this.inbox.enqueue(message);
    // Process the task immediately
    await this.processMessage(message);
    if (this.isNetworkService && this.isProxy) {
      // Send the message to the remote agent
      await this.communication.sendHttpMessage(message);
    }
  }

  public shutdown(): void {
    console.log('shutdown called');
    if (this.isNetworkService) {
      // Shutdown communication servers
      this.communication.shutdown();
    }
    console.log("Agent shutdown complete.");
  }

  public toJSON(): any {
    console.log('toJSON called');
    return {
      id: this.id,
      name: this.name,
      capabilities: this.capabilities,
      goal: this.goal,
      tools: this.tools,
      communication: this.communication,
    }
  }

  public static fromJSON(json: any): BaseAgent {
    console.log('fromJSON called with json:', json);
    return new BaseAgent(json);
  }
}
