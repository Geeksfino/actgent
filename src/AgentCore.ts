import {
  AgentCoreConfig,
  Tool,
  LLMConfig,
} from "./interfaces";
import { DefaultAgentMemory, Memory } from "./Memory";
import { PromptManager } from "./PromptManager";
import { PriorityInbox } from "./PriorityInbox";
import { Message } from "./Message";
import crypto from "crypto";
import { OpenAI } from "openai";
import { IAgentPromptTemplate } from "./IAgentPromptTemplate";
import { Session } from "./Session";
import { SessionContext } from "./SessionContext";


export class AgentCore {
  public id: string;
  public name: string;
  public role: string;
  public goal: string;
  public capabilities: string;
  private memory: Memory;
  private inbox: PriorityInbox;
  private llmConfig: LLMConfig | null;
  private llmClient: OpenAI;
  private promptManager: PromptManager;
  private contextManager: { [sessionId: string]: SessionContext } = {};
  private llmResponseHandler!: (response: any, session: Session) => void; 
  
  constructor(config: AgentCoreConfig, llmConfig: LLMConfig, promptTemplate: IAgentPromptTemplate) { // Updated constructor
    this.id = ""; // No id until registered
    this.name = config.name;
    this.role = config.role;
    this.goal = config.goal || "";
    this.capabilities = config.capabilities;
    this.inbox = new PriorityInbox();
    this.llmConfig = llmConfig || null;
    this.memory = new DefaultAgentMemory();
    
    //console.log("AgentCore LLM:" + JSON.stringify(this.llmConfig, null, 2));

    if (this.llmConfig) {
      this.llmClient = new OpenAI({
        apiKey: this.llmConfig.apiKey,
        baseURL: this.llmConfig.baseURL,
      });
    } else {
      throw new Error("No LLM client found");
    }

    this.promptManager = new PromptManager(promptTemplate); // Use the passed promptTemplate
    this.promptManager.setGoal(this.goal);
    this.promptManager.setRole(this.role);
    this.promptManager.setCapabilities(this.capabilities);
  }

  public getCapabilities(): string {
    return this.capabilities;
  }

  public async receive(message: Message): Promise<void> {
    this.inbox.enqueue(message);
    this.contextManager[message.sessionId].addMessage(message);  // Add message to context
  }

  public async start(): Promise<void> {
    this.inbox.init(this.processMessage.bind(this));
  }

  public setAgentPromptTemplate(promptTemplate: IAgentPromptTemplate): void {
    this.promptManager = new PromptManager(promptTemplate);
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

  public addLLMResponseHandler(handler: (response: any, session: Session) => void) {
    this.llmResponseHandler = handler;
  }

  private async processMessage(message: Message): Promise<void> {
    console.log("Processing message:", message);
    const response = await this.promptLLM(message);
    
    // Handle the response based on message type
    const cleanedResponse = this.cleanLLMResponse(response);
    //console.log("cleanedResponse===>", cleanedResponse);
    const session = this.contextManager[message.sessionId].getSession();

    this.llmResponseHandler(cleanedResponse, session);
  }


  public async getOrCreateSessionContext(message: Message): Promise<Session> {
    if (!this.contextManager[message.sessionId]) {
      const session = await this.createSession(message.metadata?.sender || "", message.payload.input);
      this.contextManager[message.sessionId].addMessage(message);  // Add initial message
      return session;
    }
    return this.contextManager[message.sessionId].getSession();
  }

  private async promptLLM(message: Message): Promise<string> {
    console.log("System prompt===>", this.promptManager.getSystemPrompt());
    const sessionContext = this.contextManager[message.sessionId];
    const prompt = this.promptManager.renderPrompt(sessionContext, this.promptManager.getMessageClassificationPrompt(message.payload.input), {});
    //console.log(`Interacting with LLM using prompt: ${prompt}`);

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
      // this.contextManager[message.sessionId].addToHistory(`User: ${message.payload.input}`);
      // this.contextManager[message.sessionId].addToHistory(`LLM: ${responseContent}`);
      this.contextManager[message.sessionId].addMessage(message);

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
    const s: Session = new Session(this, owner, "", description, "");
    // Initialize session context and get the session ID
    const sessionId = this.initSessionContext(s);
    s.sessionId = sessionId; // Set the generated session ID to the Session object

    // Create a Message object with session ID and description
    const message = new Message(s.sessionId, s.description);
    this.inbox.enqueue(message); // Enqueue the message
    return s;
  }

  public getSessionContext(sessionId: string): SessionContext {
    return this.contextManager[sessionId];
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
}
