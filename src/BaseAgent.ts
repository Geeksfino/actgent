import { AgentConfig, Tool, LLMConfig, CommunicationConfig, MemoryConfig, CapabilityDescription } from './interfaces';
import { Communication } from './Communication';
import { Memory } from './Memory';
import { PromptManager } from './PromptManager';
import { PriorityInbox } from './PriorityInbox';
import { Message } from './Message';
import { AgentRegistry } from './AgentRegistry';
import Bree from 'bree';
import { Worker, parentPort } from 'worker_threads';
import path from 'path';

const defaultMemoryConfig: MemoryConfig = {
  type: 'sqlite',
  dbFilePath: 'agent.db',
};

const defaultCommunicationConfig: CommunicationConfig = {};

export class BaseAgent {
  public id: string;
  public name: string;
  public communication: Communication;
  private capabilities: CapabilityDescription[];
  private inbox: PriorityInbox;
  private memory: Memory;
  private tools: { [key: string]: Tool };
  private goal: string;
  private promptManager: PromptManager;
  private llmConfig: LLMConfig | null;
  private scheduler: Bree;
  private memoryCache: { [key: string]: any } = {};
  private isProxy: boolean = false;
  private worker: Worker | null = null;
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
    this.promptManager = new PromptManager();
    this.llmConfig = config.llmConfig || null;
    this.inbox = new PriorityInbox();
    this.scheduler = new Bree({ jobs: [] });
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

    this.worker = new Worker(`
      const { parentPort } = require('worker_threads');
      const { BaseAgent } = require(${JSON.stringify(path.resolve(__dirname, './BaseAgent'))});
      (${startDecisionMakingLoop.toString()})(parentPort);
    `, { eval: true });

    this.worker.on('message', this.handleWorkerMessage.bind(this));

    // Serialize the config to JSON string
    const configJSON = JSON.stringify(this.toJSON());
    this.worker.postMessage({ type: 'initialize', config: configJSON });
  }

  private handleIncomingMessage(message: Message): void {
    console.log('handleIncomingMessage called with message:', message);
    console.log("Received incoming message:", message);
    this.sendTask(message.payload.input);
  }

  private handleWorkerMessage(message: any): void {
    console.log('handleWorkerMessage called with message:', message);
    console.log('Received message from worker:', message);
    // Handle different types of messages from the worker
    if (message.type === 'task_completed') {
      // Handle task completion
      if (this.isNetworkService) {
        // Send response back through Communication if needed
        this.communication.sendHttpMessage({ type: 'task_completed', result: message.result });
      }
    } else if (message.type === 'communication_request') {
      // Handle communication with other agents
      if (this.isNetworkService) {
        this.communication.sendHttpMessage(message.data);
      } else {
        // Handle local communication
      }
    }
  }

  public async processMessage(message: Message): Promise<void> {
    console.log('processMessage called with message:', message);
    console.log("Processing message:", message);
    const subtasks = await this.decomposeTask(message.payload.input);
    for (const subtask of subtasks) {
      await this.handleSubtask(subtask);
    }
    await this.checkGoalAchievement();
  }

  private async decomposeTask(task: string): Promise<string[]> {
    console.log('decomposeTask called with task:', task);
    const prompt = `System: ${this.goal}\nTask: ${task}\nDecompose this task into subtasks:`;
    const response = await this.callLLM(prompt);
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
    const prompt = `System: ${this.goal}\nHas the goal been achieved? Respond with Yes or No.`;
    const response = await this.callLLM(prompt);
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
    this.scheduler.add({
      name: 'proactivity-loop',
      interval
    });
    this.scheduler.start();
  }

  public async sendTask(task: string): Promise<void> {
    console.log('sendTask called with task:', task);
    const message = new Message(task);
    this.inbox.enqueue(message);
    if (this.worker) {
      this.worker.postMessage({ type: 'new_task', task: message });
    }
    if (this.isNetworkService && this.isProxy) {
      // Send the message to the remote agent
      await this.communication.sendHttpMessage(message);
    }
  }

  public shutdown(): void {
    console.log('shutdown called');
    if (this.worker) {
      this.worker.terminate();
    }
    this.scheduler.stop();
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

// Worker thread function
function startDecisionMakingLoop(port: any) {
  console.log('startDecisionMakingLoop called');
  let agent: BaseAgent | null = null;

  port.on('message', async (message: any) => {
    console.log('Worker received message:', message);
    if (message.type === 'initialize') {
      // Deserialize the config from JSON string
      const config = JSON.parse(message.config);
      agent = BaseAgent.fromJSON(config);
    } else if (message.type === 'new_task' && agent) {
      await agent.processMessage(message.task);
      port.postMessage({ type: 'task_completed', taskId: message.task.id });
    }
  });
}
