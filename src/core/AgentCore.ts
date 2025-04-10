import { AgentCoreConfig, LLMConfig, Instruction, LoggingConfig, QueryPreProcessor } from "./configs";
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
import { LLMErrorHandler } from './LLMErrorHandler';
import { coreLoggers } from './logging';
import { getEventEmitter } from "./observability/AgentEventEmitter";
import { ResponseType } from "./ResponseTypes";

import { AgentMemorySystem } from "./memory/AgentMemorySystem";

// Special control sequence for stream completion
const STREAM_CONTROL = {
  COMPLETE: "\0COMPLETE:",  // Null byte followed by completion reason
};

// Update the StreamCallback type to include sessionId parameter
export type StreamCallback = (
  delta: string, 
  control?: { type: 'completion', reason: string },
  sessionId?: string
) => void;

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
  queryPreProcessor: QueryPreProcessor | null = null;

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

  public setQueryPreProcessor(processor: QueryPreProcessor | null): void {
    this.queryPreProcessor = processor;
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
    const toolName = this.instructionToolMap[instructionName];
    console.log(`⭐ AgentCore.getToolForInstruction: ${instructionName} -> ${toolName || 'undefined'}`);
    return toolName;
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

  processStreamBuffer(force: boolean = false, sessionId?: string) {
    // Split the buffer on newline characters
    const lines = this.streamBuffer.split("\n");
    const completeLines = lines.slice(0, -1);
    this.streamBuffer = lines[lines.length - 1]; // Incomplete line remains in the buffer

    // Process all complete lines
    for (const line of completeLines) {
      for (const callback of this.streamCallbacks) {
        try {
          callback(line + "\n", undefined, sessionId); // Call the callback with each complete line and session ID
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
            callback(this.streamBuffer, undefined, sessionId); // Flush with session ID
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

    let processedInput = message;
    if (this.queryPreProcessor && message.metadata?.sender === "user") {
      const processed = await this.queryPreProcessor.process(processedInput.payload.input, message.sessionId);
      processedInput.payload.input = processed;
    }
    const response = await this.promptLLM(processedInput);

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
      // Create a new message with the tool_calls and remember it
      const toolCallMessage = session.createMessage("", "assistant", { tool_calls: JSON.parse(cleanedResponse) });
      await this.remember(toolCallMessage);
    }
  }

  private async remember(message: Message) {
    // Convert object metadata to Map
    let sender;
    if (message.metadata?.sender === 'user') {
      sender = 'user';
    } else if (message.metadata?.sender === 'assistant') {
      sender = 'assistant';
    } else if (message.metadata?.sender === 'tool') {
      sender = 'tool';
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
    
    // Store content directly for most messages
    let content = message.payload.input;
    
    // Handle tool calls in assistant messages
    if (sender === 'assistant' && message.metadata?.context?.tool_calls) {
      // Store tool_calls array for OpenAI format compatibility
      metadataMap.set('tool_calls', message.metadata.context.tool_calls);
      
      // When tool_calls is present, content should be omitted per OpenAI convention
      metadataMap.delete('content');
    }
    
    // Handle tool responses
    if (sender === 'tool' && message.metadata?.context?.tool_call_id) {
      metadataMap.set('tool_call_id', message.metadata.context.tool_call_id);
      
      // Ensure tool_call_id is properly formatted as a string
      const toolCallId = metadataMap.get('tool_call_id');
      if (toolCallId) {
        metadataMap.set('tool_call_id', String(toolCallId));
      }
    }
    
    await this.memories.remember(content, undefined, metadataMap);
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

  private async promptLLM(message: Message): Promise<string> {
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
        ...messageRecords.map((message) => {
          // Create a basic message structure
          const mapped: any = {
            role: message.role,
            content: message.content
          };
          
          // For assistant messages with tool_calls
          if (message.role === 'assistant' && message.tool_calls) {
            mapped.tool_calls = message.tool_calls;
            // When tool_calls is present, content should be omitted per OpenAI convention
            delete mapped.content;
          }
          
          // For tool messages
          if (message.role === 'tool' && message.tool_call_id) {
            mapped.tool_call_id = String(message.tool_call_id);
          }
          
          return mapped as OpenAI.Chat.Completions.ChatCompletionMessageParam;
        }),
      ];

      // Pretty print the history
      const formattedHistory = AgentCore.formatHistory(history);
      this.promptLogger.debug(`History:\n${formattedHistory}`);

      const systemPrompt = await this.promptManager.getSystemPrompt(sessionContext);
      const assistantPrompt = await this.promptManager.getAssistantPrompt(sessionContext);

      // Construct messages array, filtering out empty assistant messages which can cause issues with DeepSeek API
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
      ];
      
      // Only add assistant prompt if it's not empty
      if (assistantPrompt && assistantPrompt.trim().length > 0) {
        messages.push({ role: "assistant", content: assistantPrompt });
      }
      
      // Add history
      messages.push(...history);

      // Split into separate configs for streaming and non-streaming
      const baseConfig = {
        model: this.llmConfig?.model || "gpt-4",
        messages,
        tools: unmappedTools.length > 0 ? unmappedTools : undefined,
        ...(unmappedTools.length > 0 ? { tool_choice: "auto" as const } : {}),
      };
      this.logger.trace('LLM prompt config:', JSON.stringify(baseConfig, null, 2));
      // Variable to track if we detected tool calls during streaming
      let toolCallsInProgress = false;
      
      // Stream mode
      if (this.llmConfig?.streamMode && this.streamCallbacks.size > 0) {
        const streamConfig: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming =
          {
            ...baseConfig,
            stream: true,
          };

        let stream;
        try {
          stream = await this.llmClient.chat.completions.create(streamConfig);
        } catch (error: any) {
          this.logger.error(`Error in streaming LLM call: ${error?.message || 'Unknown error'}`, withTags(["error", "llm-api"]));
          // Handle the error gracefully using our error handler
          responseContent = await LLMErrorHandler.handleError(error, sessionContext.getSession());
          return responseContent;
        }

        let chunks = [];
        let toolCallsInProgress = false;
        let currentToolCalls = [];
        
        for await (const chunk of stream) {
          chunks.push(chunk);
          const delta = chunk.choices[0]?.delta;
          
          // Process tool calls directly from the delta (similar to OpenAI sample)
          if (delta.tool_calls) {
            toolCallsInProgress = true;
            
            // Log tool call detection
            this.logger.debug('Tool call detected in stream chunk', withTags(['response', 'tool_calls']), {
              toolCallDelta: delta.tool_calls
            });
            
            // We'll collect tool calls and process them after the stream
            for (const toolCallDelta of delta.tool_calls) {
              // Initialize the tool call if it's new
              if (!currentToolCalls[toolCallDelta.index]) {
                currentToolCalls[toolCallDelta.index] = {
                  id: toolCallDelta.id || '',
                  type: 'function',
                  function: {
                    name: '',
                    arguments: ''
                  }
                };
              }
              
              // Update the tool call with the delta information
              const currentTool = currentToolCalls[toolCallDelta.index];
              
              if (toolCallDelta.id) {
                currentTool.id = toolCallDelta.id;
              }
              
              if (toolCallDelta.function) {
                if (toolCallDelta.function.name) {
                  currentTool.function.name = toolCallDelta.function.name;
                }
                
                if (toolCallDelta.function.arguments) {
                  currentTool.function.arguments += toolCallDelta.function.arguments;
                }
              }
            }
          }
          
          // Process content delta (if any)
          const contentDelta = delta.content || "";
          responseContent += contentDelta;
          this.streamBuffer += contentDelta;
          this.processStreamBuffer(undefined, message.sessionId);
        }

        // Make sure all buffered data is sent before completion signal
        if (this.streamBuffer) {
          this.processStreamBuffer(true, message.sessionId);
        }

        const lastChunk = chunks[chunks.length - 1];
        const finishReason = lastChunk.choices[0]?.finish_reason;
        
        // If we collected tool calls during streaming, use those
        if (toolCallsInProgress && currentToolCalls.length > 0) {
          // Filter out any undefined entries (can happen with sparse arrays)
          const validToolCalls = currentToolCalls.filter(call => call !== undefined);
          
          if (validToolCalls.length > 0) {
            this.logger.debug('Using tool calls collected during streaming', withTags(['response', 'tool_calls']), {
              toolCallCount: validToolCalls.length,
              toolCalls: validToolCalls
            });
            responseContent = JSON.stringify(validToolCalls);
            return responseContent;
          }
        }
        
        // Fallback: Check if this is a tool call response by examining the finish reason
        if (finishReason === 'tool_calls') {
          // Use the existing reconstructToolCalls method to handle tool calls in stream mode
          const toolCalls = this.reconstructToolCalls(chunks);
          if (toolCalls && toolCalls.length > 0) {
            this.logger.debug('Reconstructed tool calls from stream chunks', withTags(['response', 'tool_calls']), {
              toolCallCount: toolCalls.length,
              toolCalls: toolCalls
            });
            responseContent = JSON.stringify(toolCalls);
            return responseContent;
          }
        }
        this.logger.debug(`[promptLLM] Stream finished with reason: ${finishReason}`, withTags(["response"]));
        
        // Only send completion signal after all data is processed
        if (this.llmConfig?.streamMode && 
            this.streamCallbacks.size > 0 && 
            finishReason && 
            !this.streamBuffer) {  // Ensure buffer is empty
          for (const callback of this.streamCallbacks) {
            try {
              callback("", { type: 'completion', reason: finishReason }, message.sessionId);
            } catch (error) {
              this.logger.error(`Error in stream callback during completion signal: ${error}`);
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

        let response;
        try {
          response = await this.llmClient.chat.completions.create(nonStreamConfig);
        } catch (error: any) {
          this.logger.error(`Error in non-streaming LLM call: ${error?.message || 'Unknown error'}`, withTags(["error", "llm-api"]));
          // Handle the error gracefully using our error handler
          responseContent = await LLMErrorHandler.handleError(error, sessionContext.getSession());
          return responseContent;
        }
        const message = response.choices[0].message;
        const finishReason = response.choices[0].finish_reason;
        this.logger.debug(`[promptLLM] Non-stream finished: ${JSON.stringify(message, null, 2)}`, withTags(["response"]));
        const isToolCalls = finishReason === "tool_calls";

        if (isToolCalls && message.tool_calls) {
          responseContent = JSON.stringify(message.tool_calls);
        } else {
          responseContent = message.content || "{}";
        }
      }
      //console.log(`Agent Core Response content: ${responseContent}`);

      // Handle function execution
      try {
        this.logger.debug('Raw LLM response:', 
          withTags(['response']),{
          responseLength: responseContent.length,
          firstChars: responseContent.substring(0, 50),
          lastChars: responseContent.substring(responseContent.length - 50)
        });
        
        // Final fallback: Check for special token formats (common in streaming mode with some models)
        // Only apply this if we're in stream mode and haven't already handled tool calls via other methods
        const isStreamMode = this.llmConfig?.streamMode && this.streamCallbacks.size > 0;
        const hasSpecialTokenFormat = responseContent.includes('<｜tool▁calls▁begin｜>') || 
                                    responseContent.includes('<|tool_calls_begin|>');
                                    
        if (isStreamMode && hasSpecialTokenFormat && !toolCallsInProgress) {
          this.logger.debug('Detected special token format in stream response', withTags(['response', 'stream']));
          
          // First, try to extract the function name from the special token format
          let toolName = null;
          let toolArgs = {};
          
          // Log the full response for debugging
          this.logger.debug('Full special token response for debugging:', withTags(['response', 'debug']), {
            fullResponse: responseContent
          });
          
          // Pattern to extract function name from various formats
          const functionNameMatch = responseContent.match(/function<｜tool_name｜>([\w_]+)/) || 
                                   responseContent.match(/function<\|tool_name\|>([\w_]+)/) ||
                                   responseContent.match(/<｜tool▁call▁begin｜>function<｜t[^>]*>([\w_]+)/) ||
                                   responseContent.match(/<\|tool_call_begin\|>function<\|t[^>]*>([\w_]+)/) ||
                                   responseContent.match(/list_allowed_directories/);
          
          if (functionNameMatch) {
            // If we matched the pattern but don't have a capture group (like with the list_allowed_directories match)
            if (functionNameMatch[1]) {
              toolName = functionNameMatch[1];
            } else if (responseContent.includes('list_allowed_directories')) {
              toolName = 'list_allowed_directories';
            }
            
            this.logger.debug(`Extracted tool name from special token format: ${toolName}`, 
              withTags(['response', 'recovery']));
          }
          
          // Extract JSON content from between tokens or code blocks
          try {
            // Look for JSON content between markers or in code blocks
            const jsonMatch = responseContent.match(/```json\s*([\s\S]*?)\s*```/) || 
                             responseContent.match(/\{[\s\S]*\}/g);
            
            if (jsonMatch && jsonMatch[0]) {
              const jsonContent = jsonMatch[0].startsWith('```') ? jsonMatch[1] : jsonMatch[0];
              this.logger.debug('Extracted potential JSON from special token format', withTags(['response', 'recovery']));
              
              try {
                // Try to parse the JSON content
                toolArgs = JSON.parse(jsonContent.trim() || '{}');
              } catch (parseError) {
                this.logger.warn(`Failed to parse extracted JSON: ${parseError}`, withTags(['response', 'recovery']));
                toolArgs = {};
              }
              
              // If we have a tool name, construct a proper tool call
              if (toolName) {
                const toolCall = {
                  id: `call_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 7)}`,
                  type: 'function',
                  function: {
                    name: toolName,
                    arguments: JSON.stringify(toolArgs)
                  }
                };
                
                this.logger.debug(`Constructed tool call from special token format: ${JSON.stringify(toolCall)}`, 
                  withTags(['response', 'recovery']));
                  
                // Set responseContent to the tool call array
                responseContent = JSON.stringify([toolCall]);
              } else {
                // No tool name found, just use the extracted JSON
                responseContent = jsonContent.trim() || '{}';
              }
            } else if (toolName) {
              // We have a tool name but no JSON arguments, create a tool call with empty args
              const toolCall = {
                id: `call_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 7)}`,
                type: 'function',
                function: {
                  name: toolName,
                  arguments: '{}'
                }
              };
              
              this.logger.debug(`Constructed tool call with empty args: ${JSON.stringify(toolCall)}`, 
                withTags(['response', 'recovery']));
                
              // Set responseContent to the tool call array
              responseContent = JSON.stringify([toolCall]);
            } else {
              // Fallback to empty object if no JSON found and no tool name
              this.logger.warn('Could not extract JSON or tool name from special token format', 
                withTags(['response', 'recovery']));
              responseContent = '{}';
            }
          } catch (extractError) {
            this.logger.error(`Error extracting content from special token format: ${extractError}`, 
              withTags(['error', 'recovery-failed']));
            responseContent = '{}';
          }
        }
        
        // Attempt to parse the response as JSON
        try {
          const parsed = JSON.parse(responseContent);
          this.logger.debug('Successfully parsed LLM response as JSON', withTags(['response']));
        } catch (parseError: any) {
          // Log the JSON parse error with more details
          this.logger.debug(`LLM response is not JSON: ${parseError}`, withTags(['error', 'json-parse']), {
            error: parseError?.message || 'Unknown parse error',
            responseLength: responseContent.length,
            responsePreview: responseContent.length > 100 ? 
              `${responseContent.substring(0, 50)}...${responseContent.substring(responseContent.length - 50)}` : 
              responseContent
          });
          
          // If we have an unterminated string error, attempt to fix it
          if (parseError?.message?.includes('Unterminated string')) {
            this.logger.warn('Attempting to fix unterminated string in JSON response', withTags(['recovery']));
            // Simple fix: add a closing quote if it seems to be missing
            const fixedResponse = responseContent.endsWith('"') ? responseContent : responseContent + '"';
            try {
              const parsed = JSON.parse(fixedResponse);
              this.logger.info('Successfully fixed and parsed JSON response', withTags(['recovery']));
              responseContent = fixedResponse;
            } catch (fixError) {
              this.logger.error('Failed to fix unterminated string in JSON response', withTags(['error', 'recovery-failed']));
            }
          }
        }
      } catch (error) {
        this.logger.error(`Error in LLM response processing: ${error}`, withTags(['error']));
      }
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
    
    console.log(`⭐ AgentCore.getTool: ${name} -> ${this.toolRegistry.has(name) ? 'found' : 'not found'}`);
    console.log(`⭐ AgentCore.toolRegistry keys:`, Array.from(this.toolRegistry.keys()));
    
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
    const hasTool = !!this.instructionToolMap[messageType];
    console.log(`⭐ AgentCore.hasToolForCurrentInstruction: ${messageType} -> ${hasTool}`);
    console.log(`⭐ AgentCore.instructionToolMap:`, this.instructionToolMap);
    return hasTool;
  }

  private static formatHistory(history: any[]): string {
    return 'History:\n' + history.map(entry => {
      const parsedEntry = AgentCore.parseNestedJson(entry);
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
      // Use arrow function to maintain the class context
      return data.map(item => AgentCore.parseNestedJson(item)) as T;
    } else if (typeof data === 'object' && data !== null) {
      return Object.fromEntries(
        Object.entries(data).map(([key, value]) => [key, AgentCore.parseNestedJson(value)])
      ) as T;
    } else {
      return data;
    }
  }
}
