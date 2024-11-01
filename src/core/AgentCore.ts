import { AgentCoreConfig, LLMConfig, Instruction } from "./configs";
import { DefaultAgentMemory, Memory, MemoryStorage } from "./Memory";
import { InMemoryStorage } from "./InMemoryStorage";
import { PromptManager } from "./PromptManager";
import { PriorityInbox } from "./PriorityInbox";
import { Message } from "./Message";
import { Tool, ToolOptions, ToolOutput } from "./Tool";
import { ExecutionContext } from "./ExecutionContext";
import crypto from "crypto";
import { OpenAI } from "openai";
import { IAgentPromptTemplate } from "./IPromptTemplate";
import { Session } from "./Session";
import { SessionContext } from "./SessionContext";
import fs from "fs";
import path from "path";
import { Subject } from "rxjs";
import { IClassifier } from "./IClassifier";

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
  public instructions: Instruction[] = [];
  public llmConfig: LLMConfig | null;
  public executionContext: ExecutionContext = ExecutionContext.getInstance();
  streamCallback?: (delta: string) => void;
  streamBuffer: string = "";
  llmClient: OpenAI;
  toolRegistry: Map<string, Tool<any, any, any>> = new Map();
  instructionToolMap: { [key: string]: string } = {};

  private memory: Memory;
  private inbox: PriorityInbox;
  private promptManager: PromptManager;
  private contextManager: { [sessionId: string]: SessionContext } = {};
  private classifier: IClassifier<any>;
  private logger: (sessionId: string, message: string) => void;
  private shutdownSubject: Subject<void> = new Subject<void>();

  constructor(
    config: AgentCoreConfig,
    llmConfig: LLMConfig,
    promptTemplate: IAgentPromptTemplate,
    classifier: IClassifier<any>,
    storageConfig?: StorageConfig,
    loggingConfig?: LoggingConfig
  ) {
    this.id = ""; // No id until registered
    this.name = config.name;
    this.role = config.role;
    this.goal = config.goal || "";
    this.capabilities = config.capabilities;
    this.instructions = config.instructions || [];
    this.inbox = new PriorityInbox();
    this.llmConfig = llmConfig || null;
    this.classifier = classifier;

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

    if (config.instructionToolMap) {
      this.instructionToolMap = config.instructionToolMap;
    }
    // Initialize logger
    this.logger = this.initLogger(loggingConfig);
  }

  public getCapabilities(): string {
    return this.capabilities;
  }

  public addInstruction(
    name: string,
    description: string,
    schemaTemplate?: string
  ): void {
    this.instructions.push({ name, description, schemaTemplate });
  }

  public getInstructions(): Instruction[] {
    return this.instructions;
  }

  public getInstructionByName(name: string): Instruction | undefined {
    return this.instructions.find((instruction) => instruction.name === name);
  }

  public handleInstructionWithTool(
    instructionName: string,
    toolName: string
  ): void {
    const instruction = this.getInstructionByName(instructionName);
    if (!instruction) {
      throw new Error(`Instruction with name ${instructionName} not found`);
    }

    const tool = this.toolRegistry.get(toolName);
    if (!tool) {
      throw new Error(`Tool with name ${toolName} not found in tool registry`);
    }
    this.instructionToolMap[instructionName] = toolName;
  }

  public getToolForInstruction(instructionName: string): string | undefined {
    return this.instructionToolMap[instructionName];
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

  public handleLLMResponse(response: string, session: Session): void {
    try {
      this.classifier.handleLLMResponse(response, session);
    } catch (error) {
      this.log(session.sessionId, `Error handling LLM response: ${error}`);
    }
  }

  public registerStreamCallback(callback: (delta: string) => void): void {
    this.streamCallback = callback;
  }

  processStreamBuffer(force: boolean = false) {
    // Split the buffer on newline characters
    const lines = this.streamBuffer.split("\n");
    const completeLines = lines.slice(0, -1);
    this.streamBuffer = lines[lines.length - 1]; // Incomplete line remains in the buffer

    // Process all complete lines
    for (const line of completeLines) {
      if (this.streamCallback) {
        this.streamCallback(line + "\n"); // Call the callback with each complete line
      }
    }

    // Flush the buffer if it's too large (threshold) or force flush is true
    const bufferThreshold = 100; // You can adjust this value as needed
    if (force || this.streamBuffer.length > bufferThreshold) {
      if (this.streamCallback && this.streamBuffer) {
        this.streamCallback(this.streamBuffer); // Flush the remaining content in the buffer
      }
      this.streamBuffer = ""; // Clear the buffer after flushing
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

    const response = await this.promptLLM(message, context);

    // Handle the response based on message type
    const cleanedResponse = this.cleanLLMResponse(response);
    const session = sessionContext.getSession();
    const responseMessage = session.createMessage(cleanedResponse);
    sessionContext.addMessage(responseMessage);

    // Log the output message
    this.logger(message.sessionId, `Output: ${cleanedResponse}`);
    this.handleLLMResponse(cleanedResponse, session);
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

  private async promptLLM(message: Message, context: any): Promise<string> {
    //this.log(`System prompt: ${this.promptManager.getSystemPrompt()}`);
    const sessionContext = this.contextManager[message.sessionId];

    // this.log(message.sessionId, "<------ Resolved prompt ------->");
    // this.log(
    //   message.sessionId,
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
    // this.log(message.sessionId, "<------ Resolved prompt ------->");

    try {
      let responseContent = "";

      const unmappedTools = Array.from(this.toolRegistry.values())
        .filter(
          (tool) => !Object.values(this.instructionToolMap).includes(tool.name)
        )
        .map((tool) => tool.getFunctionDescription());

      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: "system", content: this.promptManager.getSystemPrompt() },
        { role: "assistant", content: this.promptManager.getAssistantPrompt() },
        {
          role: "user",
          content: this.promptManager.getUserPrompt(
            sessionContext,
            message.payload.input,
            context
          ),
        },
      ];

      // Split into separate configs for streaming and non-streaming
      const baseConfig = {
        model: this.llmConfig?.model || "gpt-4",
        messages,
        tools: unmappedTools.length > 0 ? unmappedTools : undefined,
      };

      if (this.llmConfig?.streamMode && this.streamCallback) {
        const streamConfig: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming =
          {
            ...baseConfig,
            stream: true,
          };

        const stream =
          await this.llmClient.chat.completions.create(streamConfig);

        for await (const chunk of stream) {
          const toolCalls = chunk.choices[0]?.delta?.tool_calls;

          if (Array.isArray(toolCalls) && toolCalls.length > 0) {
            const delta = chunk.choices[0]?.delta?.tool_calls || "";
            responseContent += delta;
            this.streamBuffer += delta;
            this.processStreamBuffer();
          } else {
            const delta = chunk.choices[0]?.delta?.content || "";
            responseContent += delta;
            this.streamBuffer += delta;
            this.processStreamBuffer();
          }
        }
        this.processStreamBuffer(true);
      } else {
        const nonStreamConfig: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming =
          {
            ...baseConfig,
            stream: false,
          };

        const response =
          await this.llmClient.chat.completions.create(nonStreamConfig);
        const message = response.choices[0].message;

        if (message.tool_calls) {
          responseContent = JSON.stringify({
            tool_calls: message.tool_calls.map((toolCall) => ({
              name: toolCall.function.name,
              arguments: toolCall.function.arguments,
            })),
          });
        } else {
          responseContent = message.content || "{}";
        }
      }
      //console.log(`Agent Core Response content: ${responseContent}`);

      // Handle function execution
      try {
        const parsed = JSON.parse(responseContent);

        if (parsed.tool_calls) {
          const tool = this.getTool(parsed.tool_calls[0].name);
          if (tool) {
            const args = JSON.parse(parsed.tool_calls[0].arguments);
            const result = await tool.run(args, {});
            return result.getContent();
          }
        }
      } catch (e) {
        // Not a valid function call JSON, return original response
      }

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
    // Construct a Session object
    const s: Session = new Session(this, owner, "", description, "");
    // Initialize session context and get the session ID
    const sessionId = this.initSessionContext(s);
    s.sessionId = sessionId; // Set the generated session ID to the Session object

    // Create a Message object with session ID and description
    const message = new Message(s.sessionId, s.description);
    this.inbox.enqueue(message); // Enqueue the message
    this.log(message.sessionId, "createSession called with description:");
    this.log(message.sessionId, description);

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

  public registerTool<TInput, TOutput extends ToolOutput>(
    tool: Tool<TInput, TOutput, ToolOptions>
  ): void {
    this.toolRegistry.set(tool.name, tool);
    tool.setContext(this.executionContext);
  }

  public getTool(name: string): Tool<any, any, any> | undefined {
    return this.toolRegistry.get(name);
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

  public async shutdown(): Promise<void> {
    this.log("default", "Initiating core shutdown...");

    // Stop processing new messages
    this.inbox.stop();

    // Cancel any ongoing LLM requests (if possible)
    // Note: OpenAI doesn't provide a way to cancel ongoing requests,
    // so we'll just have to wait for them to complete

    // Clean up memory
    await this.memory.optimizeMemory();

    // Emit shutdown signal
    this.shutdownSubject.next();
    this.shutdownSubject.complete();

    // Close LLM client if necessary
    // Note: As of now, OpenAI's Node.js client doesn't require explicit closure

    this.log("default", "Core shutdown complete.");
  }
}
