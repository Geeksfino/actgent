import { connect as connectNATS, Msg, NatsConnection } from 'nats';
import { AgentConfig, Tool, LLMConfig, CommunicationConfig, MemoryConfig } from './interfaces';
import { Goal } from './Goal';
import { Communication } from './Communication';
import { Memory } from './Memory';
import { PromptManager } from './PromptManager';
import { PriorityInbox } from './PriorityInbox'; 
import { Message } from './Message';
import Bree from 'bree';

const defaultMemoryConfig: MemoryConfig = {
  type: 'sqlite',
  dbFilePath: 'actgent.db',
};

const defaultCommunicationConfig: CommunicationConfig = {
  type: 'nats',
  url: 'nats://localhost:4222',
};

export class BaseAgent {
  private id: string;
  private inbox: PriorityInbox;
  private memory: Memory;
  private tools: { [key: string]: Tool };
  private goals: Goal[];
  private communication: Communication;
  private promptManager: PromptManager;
  private llmConfig: LLMConfig | null;
  private scheduler: Bree;
  private memoryCache: { [key: string]: any } = {};
  
  constructor(config: AgentConfig) {
    this.id = config.id;
    this.memory = new Memory(config.memoryConfig || defaultMemoryConfig); 
    this.tools = config.tools || {};
    this.goals = config.goals || [];
    this.communication = new Communication(config.communicationConfig || defaultCommunicationConfig); 
    this.promptManager = new PromptManager();
    this.llmConfig = config.llmConfig || null;
    this.inbox = new PriorityInbox();
    this.scheduler = new Bree({ jobs: [] });

    this.initializeAgent();
  }

  private async initializeAgent(): Promise<void> {
    this.startDecisionMakingLoop();
    this.startHTTPServer(8080);
    this.startGRPCServer('path/to/proto/file.proto', 50051);
  }

  private async startHTTPServer(port: number): Promise<void> {
    const server = Bun.serve({
      port,
      fetch: async (req) => {
        if (req.method === 'POST' && req.url === '/queue-task') {
          const { taskDescription, priority } = await req.json() as { taskDescription: string; priority: string }; 

          const message: Message = new Message(taskDescription);
          this.inbox.enqueue(message, priority);
          return new Response('Task queued', { status: 200 });
        }

        // if (req.method === 'POST' && req.url === '/interact') {
        //   const { promptName, variables } = await req.json();
        //   const result = await this.interactWithLLM(promptName, variables);
        //   return new Response(JSON.stringify({ result }), { status: 200 });
        // }

        return new Response('Not Found', { status: 404 });
      },
    });

    console.log(`Agent HTTP server running on port ${port}`);
  }

  private startGRPCServer(protoPath: string, port: number): void {
    // gRPC server logic (requires additional setup)
  }

  // Override the planning logic
  async planNextAction(): Promise<void> {
    try {
      while (this.inbox.hasPendingMessages()) {
        const message = this.inbox.dequeue();

        if (message) { 
            const customPlan = this.generateCustomPlan(message);
            await this.executeCustomPlan(customPlan);
        }
      }
    } catch (error) {
      console.error("Error in CustomAgent planNextAction:", error);
    }
  }

  generateCustomPlan(message: Message) {
    return `Plan for task: ${message}`;
  }

  async executeCustomPlan(plan: string) {
    console.log(`Executing plan: ${plan}`);
    // Add custom logic for executing the plan
  }
  
  private async processMessage(message: any): Promise<void> {
    console.log("Processing message:", message);
    // Process message logic, interact with tools, LLM, etc.
  }

  private startDecisionMakingLoop(): void {
    this.scheduler.add({
      name: 'decision-making-loop',
      interval: '5s', 
    });
    this.scheduler.start();
  }

  public async interactWithLLM(promptName: string, variables: { [key: string]: string }): Promise<string> {
    if (!this.llmConfig) {
      throw new Error("LLM configuration not provided");
    }

    const cacheKey = `${promptName}-${JSON.stringify(variables)}`;
    const cachedResponse = await this.getFromMemory(cacheKey);
    if (cachedResponse) return cachedResponse;

    const renderedPrompt = this.promptManager.renderPrompt(promptName, variables);
    const response = await this.callLLM(renderedPrompt);
    await this.saveToMemory(cacheKey, response);

    return response;
  }

  private async callLLM(prompt: string): Promise<string> {
    // Call the LLM API here (this should be implemented)
    console.log(`Interacting with LLM using prompt: ${prompt}`);
    return "LLM response placeholder"; // Placeholder response
  }

  public addGoal(goal: Goal): void {
    this.goals.push(goal);
  }

  public addTool(tool: Tool): void {
    this.tools[tool.name] = tool;
  }

  public async saveToMemory(key: string, value: any): Promise<void> {
    this.memoryCache[key] = value;
    //await this.memory.save(key, value);
  }

  // don't know what's needed. implement later
  public async getFromMemory(key: string): Promise<any> {
    if (this.memoryCache[key]) return this.memoryCache[key];
    //const value = await this.memory.get(key); 
    //this.memoryCache[key] = value;
    //return value;
  }

  public scheduleProactivity(interval: string): void {
    this.scheduler.add({
      name: 'proactivity',
      interval,
    });
    this.scheduler.start();
  }

  public async useTool(toolName: string, args: any): Promise<any> {
    const tool = this.tools[toolName];
    if (!tool) throw new Error(`Tool ${toolName} not found`);
    return tool.execute(args);
  }

  public async shutdown(): Promise<void> {
    await this.scheduler.stop();
    console.log("Agent shutdown complete.");
  }
}