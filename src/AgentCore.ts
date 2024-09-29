import {
  AgentConfig,
  Tool,
  LLMConfig,
  CommunicationConfig,
  MemoryConfig,
  CapabilityDescription,
  Session,
} from "./interfaces";
import { DefaultAgentMemory, Memory } from "./Memory";
import { PromptManager } from "./PromptManager";
import { PriorityInbox } from "./PriorityInbox";
import { Message } from "./Message";
import crypto from "crypto";
import { OpenAI } from "openai";
import { DefaultPromptTemplate } from "./DefaultPromptTemplate";
import { AgentPromptTemplate, LLMClassification, LLMClassificationType } from "./AgentPromptTemplate";
import { SessionContext } from "./SessionContext";

export class AgentCore {
  public id: string;
  public name: string;
  public goal: string;
  public capabilities: CapabilityDescription[];
  private memory: Memory;
  private inbox: PriorityInbox;
  private llmConfig: LLMConfig | null;
  private llmClient: OpenAI;
  private promptManager: PromptManager;
  private contextManager: { [sessionId: string]: SessionContext } = {};
  private simpleQueryCallback?: (answer: string) => void;
  private complexTaskCallback?: (actionPlan: { task: string; subtasks: string[] }) => void;
  private clarificationNeededCallback?: (questions: string[]) => void;
  private commandCallback?: (command: { action: string; parameters: Record<string, string>; expectedOutcome: string }) => void;

  constructor(config: AgentConfig) {
    this.id = ""; // No id until registered
    this.name = config.name;
    this.goal = config.goal || "";
    this.capabilities = config.capabilities;
    this.inbox = new PriorityInbox();
    this.llmConfig = config.llmConfig || null;
    this.memory = new DefaultAgentMemory();

    if (config.llmConfig) {
      this.llmClient = new OpenAI({
        apiKey: config.llmConfig.apiKey,
        baseURL: config.llmConfig.baseURL,
      });
    } else {
      throw new Error("No LLM client found");
    }

    this.promptManager = new PromptManager(new DefaultPromptTemplate());
    this.promptManager.setGoal(this.goal);
  }

  public getCapabilities(): CapabilityDescription[] {
    return this.capabilities;
  }

  public async receiveMessage(message: Message): Promise<void> {
    this.inbox.enqueue(message);
  }

  public async start(): Promise<void> {
    this.inbox.init(this.processMessage.bind(this));
  }

  public setAgentPromptTemplate(promptTemplate: AgentPromptTemplate): void {
    this.promptManager = new PromptManager(promptTemplate);
  }

  public setSimpleQueryCallback(callback: (answer: string) => void): void {
    this.simpleQueryCallback = callback;
  }

  public setComplexTaskCallback(callback: (actionPlan: { task: string; subtasks: string[] }) => void): void {
    this.complexTaskCallback = callback;
  }

  public setClarificationNeededCallback(callback: (questions: string[]) => void): void {
    this.clarificationNeededCallback = callback;
  }

  public setCommandCallback(callback: (command: { action: string; parameters: Record<string, string>; expectedOutcome: string }) => void): void {
    this.commandCallback = callback;
  }

  private cleanLLMResponse(response: string): string {
    // Remove markdown code block delimiters and any surrounding whitespace
    const jsonRegex = /```json\s*([\s\S]*?)\s*```/;
    const match = response.match(jsonRegex);
    
    if (match && match[1]) {
      return match[1].trim();
    }
    
    // If no JSON block is found, return the original response stripped of backticks
    return response.replace(/`/g, '').trim();
  }

  private async processMessage(message: Message): Promise<void> {
    console.log("Processing message:", message);
    const response = await this.promptLLM(message);
    
    // Handle the response based on message type
    const cleanedResponse = this.cleanLLMResponse(response);
    const parsedResponse = JSON.parse(cleanedResponse) as LLMClassification;
    switch (parsedResponse.messageType) {
      case 'SIMPLE_QUERY':
        this.simpleQueryCallback?.(parsedResponse.answer);
        break;
      case 'COMPLEX_TASK':
        this.complexTaskCallback?.(parsedResponse.actionPlan);
        break;
      case 'CLARIFICATION_NEEDED':
        this.clarificationNeededCallback?.(parsedResponse.questions);
        break;
      case 'COMMAND':
        this.commandCallback?.(parsedResponse.command);
        break;
      default:
        console.error("Unknown message type:", parsedResponse);
    }
  }

  public async getOrCreateSessionContext(message: Message): Promise<Session> {
    if (!this.contextManager[message.sessionId]) {
      return this.createSession(message.metadata?.sender || "", message.payload.input);
    }
    return this.contextManager[message.sessionId].getSession();
  }

  private async promptLLM(message: Message): Promise<string> {
    console.log("System prompt===>", this.promptManager.getSystemPrompt());
    const session = this.getOrCreateSessionContext(message);
    const sessionContext = this.contextManager[message.sessionId];
    const prompt = this.promptManager.renderPrompt(sessionContext, this.promptManager.getMessageClassificationPrompt(message.payload.input), {});
    console.log(`Interacting with LLM using prompt: ${prompt}`);

    try {
      const response = await this.llmClient.chat.completions.create({
        model: this.llmConfig?.model || "gpt-4o",
        messages: [
          { role: "system", content: this.promptManager.getSystemPrompt() },
          { role: "user", content: prompt },
        ],
      });

      const responseContent = response.choices[0].message.content || "{}";
      // Update the session context with the decomposition result
      this.contextManager[message.sessionId].addToHistory(`User: ${message.payload.input}`);
      this.contextManager[message.sessionId].addToHistory(`LLM: ${responseContent}`);

      console.log("LLM response===>", responseContent);
      return responseContent;
    } catch (error) {
      console.error("Error interacting with LLM:", error);
      throw error;
    }
  }

  public async createSession(owner: string, description: string): Promise<Session> {
    console.log("createSession called with description:", description);

    // Construct a Session object
    const session: Session = {
      owner: owner,
      sessionId: "", // Placeholder for sessionId, will be set later
      description: description,
    };

    // Initialize session context and get the session ID
    const sessionId = this.initSessionContext(session);
    session.sessionId = sessionId; // Set the generated session ID to the Session object

    // Create a Message object with session ID and description
    const message = new Message(session.sessionId, session.description);
    this.inbox.enqueue(message); // Enqueue the message
    return session;
  }

  private initSessionContext(session: Session): string {
    const sessionId = crypto.randomUUID(); // Generate a unique session ID
    const sessionContext = new SessionContext(session); // Create a SessionContext
    this.contextManager[sessionId] = sessionContext; // Store it in the context manager
    return sessionId; // Return the generated session ID
  }

  public toJSON(): string {
    return JSON.stringify({
      id: this.id,
      name: this.name,
      goal: this.goal,
      capabilities: this.capabilities,
    });
  }

  public static fromJSON(json: string): AgentCore {
    const data = JSON.parse(json);
    const agent = new AgentCore(data);
    return agent;
  }
}
