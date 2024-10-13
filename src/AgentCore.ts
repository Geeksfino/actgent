import { AgentCoreConfig, Tool, LLMConfig } from "./interfaces";
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
import fs from "fs";
import path from "path";

interface StorageConfig {
  shortTerm?: MemoryStorage<any>;
  longTerm?: MemoryStorage<any>;
  working?: MemoryStorage<any>;
}

interface LoggingConfig {
  destination?: string;
}

export class AgentCore {
  public id: string;
  public name: string;
  public role: string;
  public goal: string;
  public capabilities: string;
  public instructions: Map<string, string> | undefined;
  private memory: Memory;
  private inbox: PriorityInbox;
  private llmConfig: LLMConfig | null;
  private llmClient: OpenAI;
  private promptManager: PromptManager;
  private contextManager: { [sessionId: string]: SessionContext } = {};
  private llmResponseHandler!: (response: any, session: Session) => void;
  private streamCallback?: (delta: string) => void;
  private streamBuffer: string = "";
  private logger: (sessionId: string, message: string) => void;

  constructor(
    config: AgentCoreConfig,
    llmConfig: LLMConfig,
    promptTemplate: IAgentPromptTemplate,
    storageConfig?: StorageConfig,
    loggingConfig?: LoggingConfig
  ) {
    this.id = ""; // No id until registered
    this.name = config.name;
    this.role = config.role;
    this.goal = config.goal || "";
    this.capabilities = config.capabilities;
    this.instructions = config.instructions || undefined;
    this.inbox = new PriorityInbox();
    this.llmConfig = llmConfig || null;

    // Initialize memory with storage backends
    const shortTermStorage =
      storageConfig?.shortTerm || new InMemoryStorage<any>();
    const longTermStorage =
      storageConfig?.longTerm || new InMemoryStorage<any>();
    const workingMemoryStorage =
      storageConfig?.working || new InMemoryStorage<any>();

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
    if (this.instructions) {
      this.promptManager.setInstructions(this.instructions);
    }

    // Initialize logger
    this.logger = this.initLogger(loggingConfig);
  }

  public getCapabilities(): string {
    return this.capabilities;
  }

  public addInstruction(name: string, instruction: string): void {
    if (!this.instructions) {
      this.instructions = new Map<string, string>();
    }
    this.instructions.set(name, instruction);
    this.promptManager.setInstructions(this.instructions);
  }

  public getInstructions(): Map<string, string> | undefined {
    return this.instructions;
  }

  public async receive(message: Message): Promise<void> {
    this.inbox.enqueue(message);
    //this.contextManager[message.sessionId].addMessage(message);  // Add message to context
  }

  public async start(): Promise<void> {
    this.inbox.init(this.processMessage.bind(this));
  }

  public setAgentPromptTemplate(promptTemplate: IAgentPromptTemplate): void {
    this.promptManager = new PromptManager(promptTemplate);
  }

  public resolvePrompt(
    sessionContext: SessionContext | null,
    message: string,
    context: any
  ): Object {
    return this.promptManager.resolvePrompt(sessionContext, message, context);
  }

  private cleanLLMResponse(response: string): string {
    // Remove markdown code block delimiters and any surrounding whitespace
    const jsonRegex = /```json\s*([\s\S]*?)\s*```/;
    const match = response.match(jsonRegex);

    if (match && match[1]) {
      return match[1].trim();
    }

    // If no JSON block is found, return the original response stripped of backticks
    return response.replace(/`/g, "").trim();
  }

  public addLLMResponseHandler(
    handler: (response: any, session: Session) => void
  ) {
    this.llmResponseHandler = handler;
  }

  public registerStreamCallback(callback: (delta: string) => void): void {
    this.streamCallback = callback;
  }

  private processStreamBuffer(force: boolean = false) {
    const lines = this.streamBuffer.split("\n");
    const completeLines = lines.slice(0, -1);
    this.streamBuffer = lines[lines.length - 1];

    for (const line of completeLines) {
      if (this.streamCallback) {
        this.streamCallback(line + "\n");
      }
    }

    if (force && this.streamBuffer) {
      if (this.streamCallback) {
        this.streamCallback(this.streamBuffer);
      }
      this.streamBuffer = "";
    }
  }

  private async processMessage(message: Message): Promise<void> {
    const sessionContext = this.contextManager[message.sessionId];

    // Log the input message
    this.logger(message.sessionId, `Input: ${message.payload.input}`);

    sessionContext.addMessage(message);

    // Process message in memory
    await this.memory.processMessage(message, sessionContext);

    const context = await this.memory.generateContext(sessionContext);
    const useStreamMode = false; // Set this to true if you want to use streaming mode
    const streamCallback = useStreamMode
      ? (delta: string) => {
          console.log("Received delta:", delta);
        }
      : undefined;

    const response = await this.promptLLM(
      message,
      context,
      useStreamMode,
      streamCallback
    );

    // Handle the response based on message type
    const cleanedResponse = this.cleanLLMResponse(response);
    const session = sessionContext.getSession();
    const responseMessage = session.createMessage(cleanedResponse);
    sessionContext.addMessage(responseMessage);

    // Log the output message
    this.logger(message.sessionId, `Output: ${cleanedResponse}`);
    this.llmResponseHandler(cleanedResponse, session);
  }

  public async getOrCreateSessionContext(message: Message): Promise<Session> {
    if (!this.contextManager[message.sessionId]) {
      const session = await this.createSession(
        message.metadata?.sender || "",
        message.payload.input
      );
      //this.contextManager[message.sessionId].addMessage(message);  // Add initial message
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
    //this.log(`System prompt: ${this.promptManager.getSystemPrompt()}`);
    const sessionContext = this.contextManager[message.sessionId];

    // console.log("<========= Resolved prompt =========>");
    // console.log(
    //   AgentCore.formatMulltiLine(
    //     JSON.stringify(
    //       this.promptManager.resolvePrompt(
    //         sessionContext,
    //       message.payload.input,
    //       context
    //     ),
    //     null,
    //       2
    //     )
    //   )
    // );
    // console.log("<======================================>");

    try {
      let responseContent = "";

      if (this.llmConfig?.streamMode && this.streamCallback) {
        const stream = await this.llmClient.chat.completions.create({
          model: this.llmConfig?.model || "gpt-4",
          messages: [
            { role: "system", content: this.promptManager.getSystemPrompt() },
            {
              role: "assistant",
              content: this.promptManager.getAssistantPrompt(),
            },
            {
              role: "user",
              content: this.promptManager.getUserPrompt(
                sessionContext,
                message.payload.input,
                context
              ),
            },
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
            {
              role: "assistant",
              content: this.promptManager.getAssistantPrompt(),
            },
            {
              role: "user",
              content: this.promptManager.getUserPrompt(
                sessionContext,
                message.payload.input,
                context
              ),
            },
          ],
        });
        responseContent = response.choices[0].message.content || "{}";
      }

      //sessionContext.addMessage(message);

      //console.log("LLM response===>", responseContent);
      return responseContent;
    } catch (error) {
      this.log(message.sessionId, `Error interacting with LLM: ${error}`);
      throw error;
    }
  }

  public async createSession(
    owner: string,
    description: string
  ): Promise<Session> {
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
      instructions: this.instructions,
    });
  }

  public async optimizeMemory(): Promise<void> {
    await this.memory.optimizeMemory();
  }

  // Method to allow changing storage backends at runtime
  public setStorageBackends(storageConfig: StorageConfig): void {
    const shortTermStorage =
      storageConfig.shortTerm || new InMemoryStorage<any>();
    const longTermStorage =
      storageConfig.longTerm || new InMemoryStorage<any>();
    const workingMemoryStorage =
      storageConfig.working || new InMemoryStorage<any>();

    this.memory = new DefaultAgentMemory(
      1000000, // maxMemorySize (use the same value as in constructor)
      shortTermStorage,
      longTermStorage,
      workingMemoryStorage
    );
  }

  private initLogger(
    loggingConfig?: LoggingConfig
  ): (sessionId: string, message: string) => void {
    if (loggingConfig?.destination) {
      const logDir = path.dirname(loggingConfig.destination);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      return (sessionId: string, message: string) => {
        const logMessage = `${new Date().toISOString()} - [Session: ${sessionId}] ${message}\n`;
        fs.appendFileSync(loggingConfig.destination!, logMessage);
      };
    } else {
      return (sessionId: string, message: string) => {
        console.log(`[Session: ${sessionId}] ${message}`);
      };
    }
  }

  public log(sessionId: string, message: string): void {
    this.logger(sessionId, `[${this.name}] ${message}`);
  }

  public setLoggingConfig(loggingConfig: LoggingConfig): void {
    this.logger = this.initLogger(loggingConfig);
  }

  private static formatMulltiLine(multiline: string): string {
    // Replace \n with actual newlines and print the formatted content
    let formattedContent = multiline.replace(/\\n/g, "\n");
    formattedContent = formattedContent.replace(/\\"/g, '"');
    return formattedContent;
  }

}
