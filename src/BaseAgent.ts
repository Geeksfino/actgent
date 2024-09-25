import { AgentConfig, Tool, LLMConfig, CommunicationConfig, MemoryConfig, CapabilityDescription, Task  } from './interfaces';
import { Communication } from './Communication';
import { Memory } from './Memory';
import { PromptManager } from './PromptManager';
import { PriorityInbox } from './PriorityInbox';
import { Message } from './Message';
import { TaskContext } from './TaskContext';
import { interval, from } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { AgentRegistry } from './AgentRegistry';
import crypto from 'crypto'; 
import { OpenAI } from 'openai';

const defaultMemoryConfig: MemoryConfig = {
  type: 'sqlite',
  dbFilePath: 'agent.db',
};

const defaultCommunicationConfig: CommunicationConfig = {};

const basePromptLibrary: { [key: string]: string } = {
  "system_goal_prompt": "System: You are an AI agent with the goal of \"{goal}\". Your objective is to align every action with this overarching mission while processing specific tasks efficiently and effectively.\nKeep this goal in mind for every task you undertake.",
  "assistant_prompt": "Assistant: ",
  "decompose_task": "Task: {task} Decompose this task into subtasks.",
  "multi_round_chat": "Message: {message}\nEngage in a conversation until the task is clarified or resolved.",
  "goal_completion": "System: {goal}\nHas the goal been achieved? Respond with Yes or No.",
  "clarification": "Message: {message}\nClarify the task or resolve ambiguities over multiple rounds of conversation.",
  "generic_task": "Task: {task}\nPlease provide insights, steps, or advice to complete this task.",
  "local_task_completion": "Subtask: {subtask}\nProvide any necessary steps or advice to complete this subtask.",
  "proactive_action": "Current context: {context}\nWhat proactive action should the agent take next?",
};

export class BaseAgent {
  public id: string;
  public name: string;
  public goal: string;
  public communication: Communication;
  public capabilities: CapabilityDescription[];
  public inbox: PriorityInbox;
  private memory: Memory;
  private tools: { [key: string]: Tool };
  private promptManager: PromptManager;
  private llmConfig: LLMConfig | null;
  private contextManager: { [taskId: string]: TaskContext } = {};
  private isProxy: boolean = false;
  private isNetworkService: boolean;
  private llmClient: OpenAI;

  constructor(config: AgentConfig) {
    console.log('BaseAgent constructor called');
    this.id = ''; // No id until registered
    this.name = config.name;
    this.capabilities = config.capabilities;
    this.memory = new Memory(config.memoryConfig || defaultMemoryConfig);
    this.tools = config.tools || {};
    this.goal = config.goal || '';
    this.communication = new Communication(config.communicationConfig || defaultCommunicationConfig);
    this.llmConfig = config.llmConfig || null;
    this.promptManager = new PromptManager(config.promptLibrary as { [key: string]: string } || basePromptLibrary);
    this.inbox = new PriorityInbox();
    this.isProxy = false;
    this.isNetworkService = config.isNetworkService || false;
    this.initializeAgent(config);

    if (config.llmConfig) {
      this.llmClient = new OpenAI({ apiKey: config.llmConfig.apiKey, baseURL: config.llmConfig.baseURL });
    }
    else {
      throw new Error("No LLM client found");
    }
    this.promptManager.setGoal(this.goal);
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

  public getCapabilities(): CapabilityDescription[] {
    return this.capabilities;
  }
  private async checkPriorityInbox(): Promise<string> {
    console.log('Checking priority inbox...');
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve('Inbox checked');
        const message = this.inbox.dequeue();
        if (message) {
          this.processMessage(message);
        }
      }, 1000);
    });
  }

  // TODO: Handle incoming messages from network
  private handleIncomingMessage(message: Message): void {
    console.log('handleIncomingMessage called with message:', message);
    //this.createTask(sender, message.payload.input);
  }

  public async processMessage(message: Message): Promise<void> {
    console.log('processMessage called with message:', message);
    // Retrieve or create TaskContext for this task
    let taskContext = this.getOrCreateTaskContext(message);
    
    // Decompose task into subtasks
    const subtasks = await this.decomposeTask(message.payload.input, taskContext);

    for (const subtask of subtasks) {
      await this.handleSubtask(subtask, taskContext);
    }

    // Check if the goal has been achieved after processing
    await this.checkGoalAchievement(taskContext);
  }

  private getOrCreateTaskContext(message: Message): TaskContext {
    if (!this.contextManager[message.taskId]) {
      const taskId = crypto.randomUUID(); // Generate a unique task ID
      const task: Task = {
        owner: message.metadata?.sender || '',
        taskId: taskId,
        description: message.payload.input
      };

      const taskContext = new TaskContext(task); // Create a TaskContext
      this.contextManager[taskId] = taskContext; // Store it in the context manager
    }
    return this.contextManager[message.taskId];
  }

  private async decomposeTask(task: string, taskContext: TaskContext): Promise<Task[]> {
    console.log('decomposeTask called with task:', task);
    const prompt = this.promptManager.renderPrompt(taskContext, 'decompose_task', { task });
    const response = await this.callLLM(prompt);
    
    // Update the task context with the decomposition result
    taskContext.addToHistory(`Decomposed: ${response}`);
    
    // Assuming response is a JSON string of tasks
    return JSON.parse(response); // Parse response to return an array of Task objects
  }

  private async handleSubtask(subtask: Task, taskContext: TaskContext): Promise<void> {
    console.log('handleSubtask called with subtask:', subtask);
    const helperAgent = await this.findHelperAgent(subtask.description); // Use subtask.description for finding helper agent

    if (helperAgent) {
      const message = new Message(taskContext.getTaskId(), subtask.description);
      await helperAgent.chat(message); // Use chat for multi-round conversation
    } else {
      await this.completeSubtaskLocally(subtask.description, taskContext);
    }
  }

  private async completeSubtaskLocally(subtask: string, taskContext: TaskContext): Promise<void> {
    console.log('completeSubtaskLocally called with subtask:', subtask);
    const prompt = this.promptManager.renderPrompt(taskContext, 'complete_subtask', { subtask });
    const response = await this.callLLM(prompt);

    // Update the task context with the completion result
    taskContext.addToHistory(`Subtask completed: ${response}`);
  }

  private async checkGoalAchievement(taskContext: TaskContext): Promise<void> {
    console.log('checkGoalAchievement called');
    const prompt = this.promptManager.renderPrompt(taskContext, 'check_goal', { goal: this.goal });
    const response = await this.callLLM(prompt);

    // Update the task context based on goal achievement check
    taskContext.addToHistory(`Goal check result: ${response}`);
    
    if (response.toLowerCase().includes('no')) {
      // Retry or further task decomposition logic
      console.log('Goal not achieved, retrying...');
    }
  }

  private async findHelperAgent(subtask: string): Promise<BaseAgent | null> {
    console.log('findHelperAgent called with subtask:', subtask);
    return await AgentRegistry.getInstance().findAgentByCapabilities(subtask); // Find agent using registry
  }

  public async chat(message: Message): Promise<void> {
    console.log('chat called with message:', message);
    
    // Ensure task context exists for multi-round chat
    let taskContext = this.getOrCreateTaskContext(message);
    
    const maxRounds = 5;
    let round = 0;
    let currentMessage = message;

    while (round < maxRounds) {
      console.log(`Round ${round + 1}: Initiating chat`);
      const prompt = this.promptManager.renderPrompt(taskContext, 'multi_round_chat', { message: currentMessage.payload.input });
      const response = await this.callLLM(prompt);
      
      // Update conversation history
      taskContext.addToHistory(`Chat round ${round + 1}: ${response}`);
      
      currentMessage = this.processResponse(taskContext, response);
      round++;

      // Break if conversation ends
      if (this.isConversationOver(response)) break;
    }
  }

  private processResponse(taskContext: TaskContext, response: string): Message {
    return new Message(taskContext.getTaskId(), response);
  }

  private isConversationOver(response: string): boolean {
    return response.includes('Task completed') || response.includes('No further actions');
  }

  public async createTask(owner: string, description: string): Promise<void> {
    console.log('createTask called with description:', description);
    
    // Construct a Task object
    const task: Task = {
      owner: owner,
      taskId: '', // Placeholder for taskId, will be set later
      description: description,
    };

    // Initialize task context and get the task ID
    const taskId = this.initTaskContext(task);
    task.taskId = taskId; // Set the generated task ID to the Task object

    // Create a Message object with task ID and description
    const message = new Message(task.taskId, task.description);
    this.inbox.enqueue(message); // Enqueue the message

    // Process the task immediately
    //await this.processMessage(message);
    
    if (this.isNetworkService && this.isProxy) {
      await this.communication.sendHttpMessage(message);
    }
  }

  private initTaskContext(task: Task): string {
    const taskId = crypto.randomUUID(); // Generate a unique task ID
    const taskContext = new TaskContext(task); // Create a TaskContext
    this.contextManager[taskId] = taskContext; // Store it in the context manager
    return taskId; // Return the generated task ID
  }

  private async callLLM(prompt: string): Promise<string> {
    console.log("System prompt===>", this.promptManager.getSystemPrompt());
    console.log(`Interacting with LLM using prompt: ${prompt}`);
    try {
      const response = await this.llmClient.chat.completions.create({
        model: this.llmConfig?.model || 'gpt-4o',
        messages: [
        { role: 'system', content: this.promptManager.getSystemPrompt() },
        { role: 'user', content: prompt },
       ],
      });
    
      const responseContent = response.choices[0].message.content || "{}";
      console.log("LLM response===>", responseContent);
      return responseContent;
    } catch (error) {
      console.error('Error interacting with LLM:', error);
      throw error;
    }
  }
  
  public shutdown(): void {
    console.log('shutdown called');
    if (this.isNetworkService) {
      this.communication.shutdown();
    }
    console.log("Agent shutdown complete.");
  }

  public toJSON(): string {
    return JSON.stringify({
      id: this.id,
      name: this.name,
      goal: this.goal,
      capabilities: this.capabilities,
    });
  }

  public static fromJSON(json: string): BaseAgent {
    const data = JSON.parse(json);
    return new BaseAgent(data);
  }
}
