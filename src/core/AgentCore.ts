import { AgentCoreConfig, LLMConfig, Instruction, LoggingConfig } from "./configs";
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
import { Subject } from "rxjs";
import { IClassifier } from "./IClassifier";
import { withTags, Logger } from './Logger';
import { coreLoggers } from './logging';
import { getEventEmitter } from "./observability/AgentEventEmitter";
import { ResponseType } from "./ResponseTypes";

import { AgentMemorySystem } from "./memory/AgentMemorySystem";

// Special control sequence for stream completion
const STREAM_CONTROL = {
  COMPLETE: "\0COMPLETE:",  // Null byte followed by completion reason
};

export type StreamCallback = (delta: string, control?: { type: 'completion', reason: string }) => void;

export class AgentCore {
  public id: string;
  public name: string;
  public role: string;
  public goal: string;
  public capabilities: string;
  public instructions: Instruction[] = [];
  public llmConfig: LLMConfig | null;
  public executionContext: ExecutionContext = ExecutionContext.getInstance();
  promptTemplate: IAgentPromptTemplate;
  private streamCallbacks: Set<StreamCallback> = new Set();
  streamBuffer: string = "";
  llmClient: OpenAI;
  toolRegistry: Map<string, Tool<any, any, any>> = new Map();
  instructionToolMap: { [key: string]: string } = {};

  private memories: AgentMemorySystem;
  private inbox: PriorityInbox;
  private promptManager: PromptManager;
  private sessionContextManager: { [sessionId: string]: SessionContext } = {};
  private classifier: IClassifier<any>;

  private shutdownSubject: Subject<void> = new Subject<void>();

  private logger = coreLoggers.main;
  private promptLogger = coreLoggers.prompt;

  constructor(
    config: AgentCoreConfig,
    llmConfig: LLMConfig,
    promptTemplate: IAgentPromptTemplate,
    classifier: IClassifier<any>,
    loggingConfig?: LoggingConfig
  ) {
    this.id = config.name; // temporary 
    this.name = config.name;
    this.role = config.role;
    this.goal = config.goal || "";
    this.capabilities = config.capabilities;
    this.instructions = config.instructions || [];
    this.inbox = new PriorityInbox();
    this.llmConfig = llmConfig || null;
    this.classifier = classifier;
    this.promptTemplate = promptTemplate;


    this.memories = new AgentMemorySystem();

    if (this.llmConfig) {
      this.llmClient = new OpenAI({
        apiKey: this.llmConfig.apiKey,
        baseURL: this.llmConfig.baseURL,
      });
    } else {
      throw new Error("No LLM client found");
    }

    this.promptManager = new PromptManager(promptTemplate);
    this.promptManager.setGoal(this.goal);
    this.promptManager.setRole(this.role);
    this.promptManager.setCapabilities(this.capabilities);
    if (this.instructions) {
      this.promptManager.setInstructions(this.instructions);
    }

    if (config.instructionToolMap) {
      this.instructionToolMap = config.instructionToolMap;
    }

    // Update logging initialization
    if (loggingConfig) {
      Logger.getInstance().setDestination(loggingConfig);
    }

    // Set agent ID in event emitter if already assigned
    if (this.id) {
      getEventEmitter().setCurrentAgent(this.id);
    }

    this.logger.debug('Initializing AgentCore');
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

  public debugPrompt(
    sessionContext: SessionContext,
    message: string,
    context: any
  ): Object {
    return this.promptManager.debugPrompt(sessionContext, message, context);
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

  public registerStreamCallback(callback: StreamCallback): void {
    this.logger.debug('Registering stream callback');
    this.streamCallbacks.add(callback);
  }

  public removeStreamCallback(callback: StreamCallback): void {
    this.logger.debug('Removing stream callback');
    this.streamCallbacks.delete(callback);
  }

  processStreamBuffer(force: boolean = false) {
    // Split the buffer on newline characters
    const lines = this.streamBuffer.split("\n");
    const completeLines = lines.slice(0, -1);
    this.streamBuffer = lines[lines.length - 1]; // Incomplete line remains in the buffer

    // Process all complete lines
    for (const line of completeLines) {
      for (const callback of this.streamCallbacks) {
        try {
          callback(line + "\n"); // Call the callback with each complete line
        } catch (error) {
          this.logger.error(`Error in stream callback: ${error}`);
        }
      }
    }

    // Flush the buffer if it's too large (threshold) or force flush is true
    const bufferThreshold = 100; // You can adjust this value as needed
    if (force || this.streamBuffer.length > bufferThreshold) {
      for (const callback of this.streamCallbacks) {
        if (callback && this.streamBuffer) {
          try {
            callback(this.streamBuffer); // Flush the remaining content in the buffer
          } catch (error) {
            this.logger.error(`Error in stream callback during force flush: ${error}`);
          }
        }
      }
      this.streamBuffer = ""; // Clear the buffer after flushing
    }
  }

  private async processMessage(message: Message): Promise<void> {
    const sessionContext = this.sessionContextManager[message.sessionId];

    // Set current agent and session in event emitter
    const emitter = getEventEmitter();
    emitter.setCurrentAgent(this.id);
    emitter.setCurrentSession(message.sessionId);

    // Log the input message
    this.logger.debug(`Fetched from inbox: ${message.payload.input}`);

    this.logger.debug(`Sender: ${message.metadata?.sender}`);
    sessionContext.addMessage(message);

    await this.remember(message);

    const response = await this.promptLLM(message);

    // Handle the response based on message type
    const cleanedResponse = this.cleanLLMResponse(response);
    this.logger.debug(`Cleaned response: ${cleanedResponse}`, withTags(["response"]));
    const session = sessionContext.getSession();
    //const responseMessage = session.createMessage(extractedResponse, "assistant");
    //sessionContext.addMessage(responseMessage);

    /*
     * Inside the handleLLMResponse call, various handlers are triggered based on the response type.
     * Among them, toolCallHandlers and routingHandlers could be triggered, in which case intermediate
     * responses as results of tool execution or message routing are wrapped into new Message objects
     * and sent back to the inbox for next turn of processing.
    */
    const responseType =this.classifier.handleLLMResponse(cleanedResponse, session);
    this.logger.debug(`Response classified as: ${responseType}`, withTags(["response"]));

    /*
     * Only responses meant to be sent back to the user are added to memory for context.
     */
    if (responseType === ResponseType.CONVERSATION || responseType === ResponseType.EVENT) {
      // Extract data from LLM response. A prompt template might be instructing the LLM to
      // respond with a structured JSON object. But the object could contain various fields
      // that are for processing support purposes. These fields could be useless or even 
      // harmful to be used as context to prompt LLM. So before adding them to memory, 
      // we need to 'unwrap' or extract the data from the LLM response. But the extraction
      // process is different for each prompt template, so we need to call a method in the
      // prompt template to do the extraction. A prompt template decides how the LLM
      // response is structured and so it should also know how to extract the data from it.
      const extractedData = this.promptTemplate.extractDataFromLLMResponse(cleanedResponse);
      this.logger.debug(`AgentCore: extractedDataFromLLMResponse: ${extractedData}`, withTags(["response"]));
      const conversationMessage = session.createMessage(extractedData, "assistant");
      //sessionContext.addMessage(conversationMessage);

      await this.remember(conversationMessage);
    } else if (responseType === ResponseType.TOOL_CALL) {
      // not sure what to do here yet
    }
  }

  private async remember(message: Message) {
    // Convert object metadata to Map
    let sender;
    if (message.metadata?.sender === 'user') {
      sender = 'user';
    } else if (message.metadata?.sender === 'assistant') {
      sender = 'assistant';
    }
    const metadataMap = new Map(
      message.metadata ? 
        Object.entries({
          role: sender,
          timestamp: message.metadata.timestamp,
          priority: message.metadata.priority,
          ...message.metadata.context
        }) : []
    );
    await this.memories.remember(message.payload.input, undefined, metadataMap);
  }

  public async getOrCreateSessionContext(message: Message): Promise<Session> {
    if (!this.sessionContextManager[message.sessionId]) {
      const session = await this.createSession(
        message.metadata?.sender || "",
        message.payload.input
      );
      return session;
    }
    return this.sessionContextManager[message.sessionId].getSession();
  }

  private async promptLLM(message: Message, context?: Record<string, any>): Promise<string> {
    //this.log(`System prompt: ${this.promptManager.getSystemPrompt()}`);
    const sessionContext = this.sessionContextManager[message.sessionId];

    const systemDebugPrompt = await this.promptTemplate.debugPrompt(this.promptManager, "system", sessionContext);
    const assistantDebugPrompt = await this.promptTemplate.debugPrompt(this.promptManager, "assistant", sessionContext);
    this.promptLogger.debug(systemDebugPrompt);
    this.promptLogger.debug(assistantDebugPrompt);

    try {
      let responseContent = "";

      const unmappedTools = Array.from(this.toolRegistry.values())
        .filter(
          (tool) => !Object.values(this.instructionToolMap).includes(tool.name)
        )
        .map((tool) => tool.getFunctionDescription());
      
      // Debug logging for tools being sent to LLM
      this.promptLogger.debug(`Tools being sent to LLM:`, 
        withTags(['tools', 'llm-request']), {
        toolCount: unmappedTools.length,
        toolNames: Array.from(this.toolRegistry.values())
          .filter(tool => !Object.values(this.instructionToolMap).includes(tool.name))
          .map(tool => tool.name),
        toolDefinitions: unmappedTools
      });

      // Debug logging for instruction-mapped tools
      this.promptLogger.debug(`Instruction-mapped tools:`, 
        withTags(['tools', 'llm-request']), {
        mappings: this.instructionToolMap,
        excludedFromLLM: Array.from(this.toolRegistry.values())
          .filter(tool => Object.values(this.instructionToolMap).includes(tool.name))
          .map(tool => tool.name)
      });

      const messageRecords = await this.memories.recallRecentMessages();
      const history: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        ...messageRecords.map(({ role, content }) => ({ role, content })),
      ];
  
      // Pretty print the history
      const formattedHistory = AgentCore.formatHistory(history);
      this.promptLogger.debug(`History:\n${formattedHistory}`);

      const systemPrompt = await this.promptManager.getSystemPrompt(sessionContext);
      const assistantPrompt = await this.promptManager.getAssistantPrompt(sessionContext);

      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
        { role: "assistant", content: assistantPrompt },
        ...history,
        // {
        //   role: "user",
        //   content: this.promptManager.getUserPrompt(
        //     sessionContext,
        //     message.payload.input,
        //     context
        //   ),
        // },
      ];

      // Split into separate configs for streaming and non-streaming
      const baseConfig = {
        model: this.llmConfig?.model || "gpt-4",
        messages,
        tools: unmappedTools.length > 0 ? unmappedTools : undefined,
      };

      // Stream mode
      if (this.llmConfig?.streamMode && this.streamCallbacks.size > 0) {
        const streamConfig: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming =
          {
            ...baseConfig,
            stream: true,
          };

        const stream =
          await this.llmClient.chat.completions.create(streamConfig);

        let chunks = [];
        let accumulatedToolCalls: any[] = [];
        let isCollectingToolCalls = false;

        for await (const chunk of stream) {
          chunks.push(chunk);
          
          // Check if this chunk contains tool call information
          const toolCallDelta = chunk.choices[0]?.delta?.tool_calls;
          
          if (toolCallDelta) {
            isCollectingToolCalls = true;
            // Don't send tool calls to stream, accumulate them instead
            this.logger.debug('Receiving tool call chunk', withTags(['tool_calls']), {
              toolCallDelta
            });
            
            // Add to accumulated tool calls
            accumulatedToolCalls.push(chunk);
          } else {
            const delta = chunk.choices[0]?.delta?.content || "";
            if (!isCollectingToolCalls) {
              responseContent += delta;
              this.streamBuffer += delta;
              this.processStreamBuffer();
            }
          }
        }

        // Make sure all buffered data is sent before completion signal
        if (this.streamBuffer && !isCollectingToolCalls) {
          this.processStreamBuffer(true);
        }

        const lastChunk = chunks[chunks.length - 1];
        const finishReason = lastChunk.choices[0]?.finish_reason;
        this.logger.debug(`[promptLLM] Stream finished with reason: ${finishReason}`, withTags(["response"]));
        
        // If we collected tool calls, execute them and make a follow-up call
        if (isCollectingToolCalls && finishReason === "tool_calls" && accumulatedToolCalls.length > 0) {
          // Reconstruct the complete tool calls from chunks
          const toolCalls = this.reconstructToolCalls(accumulatedToolCalls);
          
          if (toolCalls.length > 0) {
            this.logger.debug('Executing tool calls from stream', withTags(['tool_calls']), {
              toolCalls: toolCalls.map(tc => ({
                id: tc.id,
                name: tc.function.name,
                arguments: tc.function.arguments
              }))
            });
            
            // Create updated messages with tool calls and results
            const updatedMessages = [...messages];
            
            // Add assistant message with tool calls
            updatedMessages.push({
              role: "assistant",
              tool_calls: toolCalls
            });
            
            // Execute each tool and add result
            for (const toolCall of toolCalls) {
              try {
                // The OpenAI API response for tool calls can come in different formats
              // Regular format: { id, type: 'function', function: { name, arguments } }
              // But sometimes in streaming: { id, type, name, arguments } 
              
              // Try both potential locations for the tool name
              let toolName = toolCall.function?.name;
              
              // Handle various malformed cases from the OpenAI API
              const toolCallAny = toolCall as any;
              
              // Case 1: Flattened structure - name at top level
              if (!toolName && toolCallAny.name) {
                toolName = toolCallAny.name;
              }
              
              // If we still don't have a name, handle the error
              if (!toolName) {
                // Log the exact structure we received for debugging
                this.logger.warn(`Tool call is missing function name property`, withTags(['tool_calls']), {
                  toolCallStructure: JSON.stringify(toolCall)
                });
                
                updatedMessages.push({
                  role: "tool",
                  tool_call_id: toolCall.id,
                  content: `Error: Tool call is missing function name property`
                });
                continue;
              }
              
              this.logger.debug(`Looking up tool: ${toolName}`, withTags(['tool_calls']));
              const tool = this.getTool(toolName);
                
                if (tool) {
                  const args = JSON.parse(toolCall.function?.arguments || "{}");
                  const result = await tool.run(args, {});
                  
                  // Add the tool result
                  updatedMessages.push({
                    role: "tool",
                    tool_call_id: toolCall.id,
                    content: result.getContent()
                  });
                } else {
                  this.logger.warn(`Tool ${toolName} not found`, withTags(['tool_calls']));
                  // Add error message for missing tool
                  updatedMessages.push({
                    role: "tool",
                    tool_call_id: toolCall.id,
                    content: `Error: Tool '${toolName}' not found`
                  });
                }
              } catch (error: unknown) {
                const functionName = toolCall.function?.name || 'unknown';
                this.logger.error(`Error executing tool ${functionName}:`, error);
                updatedMessages.push({
                  role: "tool",
                  tool_call_id: toolCall.id, 
                  content: `Error executing tool: ${error instanceof Error ? error.message : String(error)}`
                });
              }
            }
            
            // Make a follow-up call with the tool results
            const followUpConfig: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
              ...baseConfig,
              messages: updatedMessages,
              stream: true
            };
            
            this.logger.debug('Making follow-up call with tool results', withTags(['tool_calls']));
            
            // Stream the follow-up response
            const followUpStream = await this.llmClient.chat.completions.create(followUpConfig);
            
            responseContent = ""; // Reset response content for the follow-up
            for await (const chunk of followUpStream) {
              const delta = chunk.choices[0]?.delta?.content || "";
              responseContent += delta;
              this.streamBuffer += delta;
              this.processStreamBuffer();
            }
            
            // Make sure all buffered data is sent
            if (this.streamBuffer) {
              this.processStreamBuffer(true);
            }
          }
        }
        
        // Only send completion signal after all data is processed
        if (this.llmConfig?.streamMode && 
            this.streamCallbacks.size > 0 && 
            finishReason && 
            !this.streamBuffer) {  // Ensure buffer is empty
          for (const callback of this.streamCallbacks) {
            try {
              callback("", { type: 'completion', reason: finishReason });
            } catch (error: unknown) {
              this.logger.error(`Error in stream callback during completion signal: ${error instanceof Error ? error.message : String(error)}`);
            }
          }
        }
      } else {
        // Non-stream mode
        const nonStreamConfig: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming =
          {
            ...baseConfig,
            stream: false,
          };

        const response =
          await this.llmClient.chat.completions.create(nonStreamConfig);
        const message = response.choices[0].message;
        const finishReason = response.choices[0].finish_reason;
        this.logger.debug(`[promptLLM] Non-stream finished with reason: ${finishReason}`, withTags(["response"]));
        
        // Check if we need to execute tools
        if (finishReason === "tool_calls" && message.tool_calls && message.tool_calls.length > 0) {
          // Inspect the raw structure to diagnose the issue
          const rawToolCalls = JSON.stringify(message.tool_calls, null, 2);
          this.logger.debug('Raw tool calls from OpenAI response:', withTags(['tool_calls']), {
            rawToolCalls
          });
          
          // Log the parsed structure
          this.logger.debug('Executing tool calls from non-stream response', withTags(['tool_calls']), {
            toolCalls: message.tool_calls.map(tc => ({
              id: tc.id,
              type: tc.type,  // This is 'function'
              name: tc.function?.name, // The actual function name to call
              arguments: tc.function?.arguments
            }))
          });
          
          // Create updated messages with tool calls and results
          const updatedMessages = [...messages];
          
          // Add assistant message with tool calls
          updatedMessages.push({
            role: "assistant",
            tool_calls: message.tool_calls
          });
          
          // Execute each tool and add result
          for (const toolCall of message.tool_calls) {
            try {
              // The OpenAI API response for tool calls can come in different formats
              // Regular format: { id, type: 'function', function: { name, arguments } }
              // But sometimes in streaming: { id, type, name, arguments } 
              
              // Try both potential locations for the tool name
              let toolName = toolCall.function?.name;
              
              // Handle various malformed cases from the OpenAI API
              const toolCallAny = toolCall as any;
              
              // Case 1: Flattened structure - name at top level
              if (!toolName && toolCallAny.name) {
                toolName = toolCallAny.name;
              }
              
              // If we still don't have a name, handle the error
              if (!toolName) {
                // Log the exact structure we received for debugging
                this.logger.warn(`Tool call is missing function name property`, withTags(['tool_calls']), {
                  toolCallStructure: JSON.stringify(toolCall)
                });
                
                updatedMessages.push({
                  role: "tool",
                  tool_call_id: toolCall.id,
                  content: `Error: Tool call is missing function name property`
                });
                continue;
              }
              
              this.logger.debug(`Looking up tool: ${toolName}`, withTags(['tool_calls']));
              const tool = this.getTool(toolName);
              
              if (tool) {
                const args = JSON.parse(toolCall.function?.arguments || "{}");
                const result = await tool.run(args, {});
                
                // Add the tool result
                updatedMessages.push({
                  role: "tool",
                  tool_call_id: toolCall.id,
                  content: result.getContent()
                });
              } else {
                this.logger.warn(`Tool ${toolName} not found`, withTags(['tool_calls']));
                // Add error message for missing tool
                updatedMessages.push({
                  role: "tool",
                  tool_call_id: toolCall.id,
                  content: `Error: Tool '${toolName}' not found`
                });
              }
            } catch (error: unknown) {
              const functionName = toolCall.function?.name || 'unknown';  
              this.logger.error(`Error executing tool ${functionName}:`, error);
              updatedMessages.push({
                role: "tool",
                tool_call_id: toolCall.id, 
                content: `Error executing tool: ${error instanceof Error ? error.message : String(error)}`
              });
            }
          }
          
          // Add a max recursion depth parameter to the function to track recursion depth
          const maxToolRecursionDepth = 3; // Limit recursion to prevent infinite loops
          const currentRecursionDepth = (baseConfig as any).recursionDepth || 0;
          
          this.logger.debug(`Current tool recursion depth: ${currentRecursionDepth}`, withTags(['tool_calls']));
          
          if (currentRecursionDepth >= maxToolRecursionDepth) {
            this.logger.warn(`Maximum tool recursion depth (${maxToolRecursionDepth}) reached, stopping further tool execution`, 
                             withTags(['tool_calls']));
            return `I've reached the maximum number of consecutive tool calls (${maxToolRecursionDepth}). To prevent potential infinite loops, I'll stop here. If you need to execute more tools, please make a new request.`;
          }
          
          // Make a follow-up call with the tool results
          // Create a type-safe config without the custom property
          const followUpConfig: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
            ...baseConfig,
            messages: updatedMessages,
            stream: false
          };
          
          // Then add our custom tracking property with type assertion
          (followUpConfig as any).recursionDepth = currentRecursionDepth + 1;
          
          this.logger.debug('Making follow-up call with tool results', withTags(['tool_calls']));
          
          // Get the follow-up response
          const followUpResponse = await this.llmClient.chat.completions.create(followUpConfig);
          const followUpMessage = followUpResponse.choices[0].message;
          const followUpFinishReason = followUpResponse.choices[0].finish_reason;
          
          // Check if the follow-up response is also requesting tool calls
          if (followUpFinishReason === "tool_calls" && followUpMessage.tool_calls && followUpMessage.tool_calls.length > 0) {
            this.logger.debug('Follow-up response contains more tool calls, would require additional recursion',
                             withTags(['tool_calls']), {
                                toolCount: followUpMessage.tool_calls.length,
                                recursionDepth: currentRecursionDepth + 1
                             });
          }
          
          responseContent = followUpMessage.content || "";
        } else {
          responseContent = message.content || "{}";
        }
      }
      this.logger.debug('Final LLM response:', 
        withTags(['response']), {
        responseLength: responseContent.length,
        firstChars: responseContent.substring(0, 300),
        lastChars: responseContent.substring(responseContent.length - 50)
      });

      return responseContent;
    } catch (error) {
      this.logger.error(`Error interacting with LLM: ${error}`);
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
    const message = s.createMessage(s.description);
    this.inbox.enqueue(message); // Enqueue the message
    this.logger.debug(`createSession called with description: ${description}`);

    return s;
  }

  public getSessionContext(sessionId: string): SessionContext {
    return this.sessionContextManager[sessionId];
  }

  private initSessionContext(session: Session): string {
    const sessionId = crypto.randomUUID(); // Generate a unique session ID
    const sessionContext = new SessionContext(session); // Create a SessionContext
    this.sessionContextManager[sessionId] = sessionContext; // Store it in the context manager
    return sessionId; // Return the generated session ID
  }

  /**
   * Reconstructs complete tool calls from stream chunks.
   * OpenAI streams tool calls piece by piece, so we need to accumulate and reconstruct them.
   */
  private reconstructToolCalls(chunks: any[]): any[] {
    this.logger.debug('Reconstructing tool calls from chunks', withTags(['tool_calls']), {
      chunkCount: chunks.length
    });
    
    const toolCallsMap = new Map<string, any>();
    
    for (const chunk of chunks) {
      const toolCallDeltas = chunk.choices[0]?.delta?.tool_calls || [];
      
      for (const delta of toolCallDeltas) {
        const index = delta.index;
        
        if (!toolCallsMap.has(String(index))) {
          toolCallsMap.set(String(index), {
            id: delta.id || "",
            function: {
              name: "",
              arguments: ""
            },
            type: "function"
          });
        }
        
        const currentTool = toolCallsMap.get(String(index));
        
        // Update the id if provided
        if (delta.id) {
          currentTool.id = delta.id;
        }
        
        // Update function properties
        if (delta.function) {
          if (delta.function.name) {
            currentTool.function.name = delta.function.name;
          }
          
          if (delta.function.arguments) {
            currentTool.function.arguments += delta.function.arguments;
          }
        }
        
        toolCallsMap.set(String(index), currentTool);
      }
    }
    
    // Convert the map to an array
    return Array.from(toolCallsMap.values());
  }

  public registerTool<TInput, TOutput extends ToolOutput>(
    tool: Tool<TInput, TOutput, ToolOptions>
  ): void {
    this.toolRegistry.set(tool.name, tool);
    tool.setContext(this.executionContext);
  }

  public getTool(name: string): Tool<any, any, any> | undefined {
    this.logger.debug(`Looking for tool: '${name}'`, withTags(['tool_calls']), {
      availableTools: Array.from(this.toolRegistry.keys())
    });
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


  public log(sessionId: string, message: string): void {
    this.logger.debug(`[Session: ${sessionId}] [${this.name}] ${message}`);
  }

  public setLoggingConfig(loggingConfig: LoggingConfig): void {
    Logger.getInstance().setDestination(loggingConfig);
  }

  public async shutdown(): Promise<void> {
    this.logger.debug('Initiating core shutdown...');

    // Stop processing new messages
    this.inbox.stop();

    // Cancel any ongoing LLM requests (if possible)
    // Note: OpenAI doesn't provide a way to cancel ongoing requests,
    // so we'll just have to wait for them to complete

    // Emit shutdown signal
    this.shutdownSubject.next();
    this.shutdownSubject.complete();

    // Close LLM client if necessary
    // Note: As of now, OpenAI's Node.js client doesn't require explicit closure

    this.logger.debug('Core shutdown complete.');
  }

  handleError(error: Error) {
    this.logger.error('AgentCore Error:', error);
  }

  async run() {
    this.logger.debug('Agent starting execution');
    try {
      // ... execution logic
    } catch (error) {
      this.logger.error('Error during agent execution:', error);
      throw error;
    }
  }

  public hasToolForCurrentInstruction(messageType?: string): boolean {
    if (!messageType) return false;
    return !!this.instructionToolMap[messageType];
  }

  private static formatHistory(history: any[]): string {
    return 'History:\n' + history.map(entry => {
      const parsedEntry = this.parseNestedJson(entry);
      return JSON.stringify(parsedEntry, null, 4);
    })
    .join('\n')
    .split('\n')
    .map(line => '  ' + line)
    .join('\n');
  }

  // Helper method to try formatting JSON strings
  private static parseNestedJson<T>(data: T): T {
    if (typeof data === 'string') {
      try {
        return JSON.parse(data) as T;
      } catch (error) {
        return data as T;
      }
    } else if (Array.isArray(data)) {
      return data.map(this.parseNestedJson) as T;
    } else if (typeof data === 'object' && data !== null) {
      return Object.fromEntries(
        Object.entries(data).map(([key, value]) => [key, this.parseNestedJson(value)])
      ) as T;
    } else {
      return data;
    }
  }
}
