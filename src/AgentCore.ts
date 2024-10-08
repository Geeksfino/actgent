import {
  AgentCoreConfig,
  Tool,
  LLMConfig,
} from "./interfaces";
import { DefaultAgentMemory, Memory, MemoryStorage } from "./Memory";
import { InMemoryStorage } from "./InMemoryStorage";
import { PromptManager } from "./PromptManager";
import { PriorityInbox } from "./PriorityInbox";
import { Message } from "./Message";
import crypto from "crypto";
import { OpenAI } from "openai";
import { IAgentPromptTemplate } from "./IPromptTemplate";
import { Session } from "./Session";
import { SessionContext } from "./SessionContext";

interface StorageConfig {
  shortTerm?: MemoryStorage<any>;
  longTerm?: MemoryStorage<any>;
  working?: MemoryStorage<any>;
}

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
  private streamCallback?: (delta: string) => void;
  private streamBuffer: string = '';

  constructor(
    config: AgentCoreConfig,
    llmConfig: LLMConfig,
    promptTemplate: IAgentPromptTemplate,
    storageConfig?: StorageConfig
  ) {
    this.id = ""; // No id until registered
    this.name = config.name;
    this.role = config.role;
    this.goal = config.goal || "";
    this.capabilities = config.capabilities;
    this.inbox = new PriorityInbox();
    this.llmConfig = llmConfig || null;
    
    // Initialize memory with storage backends
    const shortTermStorage = storageConfig?.shortTerm || new InMemoryStorage<any>();
    const longTermStorage = storageConfig?.longTerm || new InMemoryStorage<any>();
    const workingMemoryStorage = storageConfig?.working || new InMemoryStorage<any>();

    this.memory = new DefaultAgentMemory(
      1000000, // maxMemorySize (adjust as needed)
      shortTermStorage,
      longTermStorage,
      workingMemoryStorage
    );
    
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

  public registerStreamCallback(callback: (delta: string) => void): void {
    this.streamCallback = callback;
  }

  private processStreamBuffer(force: boolean = false) {
    const lines = this.streamBuffer.split('\n');
    const completeLines = lines.slice(0, -1);
    this.streamBuffer = lines[lines.length - 1];

    for (const line of completeLines) {
      if (this.streamCallback) {
        this.streamCallback(line + '\n');
      }
    }

    if (force && this.streamBuffer) {
      if (this.streamCallback) {
        this.streamCallback(this.streamBuffer);
      }
      this.streamBuffer = '';
    }
  }

  private async processMessage(message: Message): Promise<void> {
    console.log("Processing message:", message);
    const sessionContext = this.contextManager[message.sessionId];
    
    // Process message in memory
    await this.memory.processMessage(message, sessionContext);

    const context = await this.memory.generateContext(sessionContext);
    const useStreamMode = false; // Set this to true if you want to use streaming mode
    const streamCallback = useStreamMode ? (delta: string) => {
      // Handle delta updates here, e.g., send to a websocket
      console.log("Received delta:", delta);
    } : undefined;

    const response = await this.promptLLM(message, context, useStreamMode, streamCallback);
    
    // Handle the response based on message type
    const cleanedResponse = this.cleanLLMResponse(response);
    const session = sessionContext.getSession();

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

  private async promptLLM(
    message: Message,
    context: any,
    streamMode: boolean = false,
    streamCallback?: (delta: string) => void
  ): Promise<string> {
    console.log("System prompt===>", this.promptManager.getSystemPrompt());
    const sessionContext = this.contextManager[message.sessionId];
    const prompt = this.promptManager.renderPrompt(
      this.contextManager[message.sessionId],
      this.promptManager.getMessageClassificationPrompt(message.payload.input),
      context
    );

    try {
      let responseContent = "";

      if (this.llmConfig?.streamMode && this.streamCallback) {
        const stream = await this.llmClient.chat.completions.create({
          model: this.llmConfig?.model || "gpt-4",
          messages: [
            { role: "system", content: this.promptManager.getSystemPrompt() },
            { role: "user", content: prompt },
          ],
          stream: true,
        });

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content || "";
          responseContent += delta;
          this.streamBuffer += delta;
          this.processStreamBuffer();
        }
        // Process any remaining content in the buffer
        this.processStreamBuffer(true);
      } else {
        const response = await this.llmClient.chat.completions.create({
          model: this.llmConfig?.model || "gpt-4",
          messages: [
            { role: "system", content: this.promptManager.getSystemPrompt() },
            { role: "user", content: prompt },
          ],
        });
        responseContent = response.choices[0].message.content || "{}";
      }

      sessionContext.addMessage(message);

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

  public async optimizeMemory(): Promise<void> {
    await this.memory.optimizeMemory();
  }

  // Method to allow changing storage backends at runtime
  public setStorageBackends(storageConfig: StorageConfig): void {
    const shortTermStorage = storageConfig.shortTerm || new InMemoryStorage<any>();
    const longTermStorage = storageConfig.longTerm || new InMemoryStorage<any>();
    const workingMemoryStorage = storageConfig.working || new InMemoryStorage<any>();

    this.memory = new DefaultAgentMemory(
      1000000, // maxMemorySize (use the same value as in constructor)
      shortTermStorage,
      longTermStorage,
      workingMemoryStorage
    );
  }
}