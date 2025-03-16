// AbstractClassifier.ts
import {
  IClassifier,
  ClassificationTypeConfig,
} from "./IClassifier";
import { Session } from "./Session";
import { InferClassificationUnion } from "./TypeInference";
import { ParsedLLMResponse, ResponseType } from "./ResponseTypes";
import { logger } from "./Logger";

export abstract class AbstractClassifier<T extends readonly ClassificationTypeConfig[]>
  implements IClassifier<T>
{  
  protected readonly schemaTypes: T;

  constructor(schemaTypes: T) {
    this.schemaTypes = schemaTypes;
  }

  public getClassificationTypeDefinition(): Readonly<T> {
    return this.schemaTypes as Readonly<T>;
  }

  protected abstract parseLLMResponse(
    response: string
  ): {
    isToolCall: boolean;
    instruction: string | undefined;
    parsedLLMResponse: InferClassificationUnion<T>;
    answer: string | undefined;
  };

  protected categorizeLLMResponse(
    response: string,
  ): ParsedLLMResponse<T> | null {
    // Default implementation returns null to indicate not implemented
    return null;
  }

  // Extract tool call information from OpenAI-format responses
  protected extractToolCallInfo(response: string): { 
    id?: string; 
    name?: string;
    arguments?: any;
    originalToolCalls?: Array<any>;
  } {
    try {
      const parsed = JSON.parse(response);
      
      // Handle array format where tool call is the first element
      if (Array.isArray(parsed) && parsed.length > 0) {
        const toolCall = parsed[0];
        // Ensure the tool call has id, type, function.name, and function.arguments
        if (toolCall.id && toolCall.type === "function" && toolCall.function?.name && toolCall.function?.arguments !== undefined) {
          // Parse arguments if they're a string
          let toolArguments = toolCall.function.arguments;
          
          if (typeof toolArguments === 'string') {
            try {
              // Try to parse the arguments if they're a JSON string
              toolArguments = JSON.parse(toolArguments);
            } catch {
              // If parsing fails, keep the original string
              logger.debug('Failed to parse tool arguments as JSON, using as-is');
            }
          }
          
          return {
            id: toolCall.id,
            name: toolCall.function.name,
            arguments: toolArguments,
            originalToolCalls: parsed
          };
        }
      }
      
      // Also try to extract tool calls from the 'tool_calls' property (OpenAI format)
      if (parsed.tool_calls && parsed.tool_calls.length > 0) {
        const toolCall = parsed.tool_calls[0];
        if (toolCall && toolCall.function && toolCall.function.name) {
          // Parse arguments if they're a string
          let toolArguments = toolCall.function.arguments;
          
          if (typeof toolArguments === 'string') {
            try {
              // Try to parse the arguments if they're a JSON string
              toolArguments = JSON.parse(toolArguments);
            } catch {
              // If parsing fails, keep the original string
              logger.debug('Failed to parse tool arguments as JSON, using as-is');
            }
          }
          
          return {
            id: toolCall.id,
            name: toolCall.function.name,
            arguments: toolArguments,
            originalToolCalls: parsed.tool_calls
          };
        }
      }
      
      // Only return originalToolCalls if it's an array or object that might contain tool call info
      // For primitive values like strings, numbers, or booleans, return an empty object
      if (parsed && typeof parsed === 'object') {
        return {
          // Store the original parsed object only if it might contain tool call info
          // This helps debugging but doesn't confuse downstream processing
          originalToolCalls: Array.isArray(parsed) || Object.keys(parsed).length > 0 ? parsed : undefined
        };
      }
      
      // For primitive values (string, number, boolean), return empty object
      return {};
    } catch (error) {
      // Not JSON or doesn't contain tool call info
      return {};
    }
  }

  public handleLLMResponse(
    response: string,
    session: Session
  ): ResponseType {
    try {
      // Extract tool call information for any response
      const toolCallInfo = this.extractToolCallInfo(response);
      
      // Only log tool call info if there's meaningful content to avoid confusion
      if (Object.keys(toolCallInfo).length > 0) {
        logger.info(`Extracted tool call info: ${JSON.stringify(toolCallInfo)}`);
      } else {
        logger.debug('No tool call information found in response', {
          responseLength: response.length,
          responsePreview: response.length > 100 ? 
            `${response.substring(0, 50)}...${response.substring(response.length - 50)}` : 
            response
        });
      }

      // Check if the response is a tool call
      if (toolCallInfo.id) {
        const categorizedResponse = {
          type: ResponseType.TOOL_CALL,
          id: toolCallInfo.id,
          name: toolCallInfo.name,
          arguments: toolCallInfo.arguments,
          originalToolCalls: toolCallInfo.originalToolCalls,
          structuredData: {
            id: toolCallInfo.id,
            name: toolCallInfo.name,
            arguments: toolCallInfo.arguments,
            originalToolCalls: toolCallInfo.originalToolCalls
          },
          messageType: 'TOOL_INVOCATION'
        };

        session.triggerToolCallsHandlers(categorizedResponse);
        return ResponseType.TOOL_CALL;
      }

      // Try the new categorization first
      let categorizedResponse = this.categorizeLLMResponse(response);
      
      if (categorizedResponse) {
        
        // Route response based on type
        switch (categorizedResponse.type) {
          case ResponseType.EVENT:
            console.log(`⭐ AbstractClassifier: EVENT response with messageType: ${categorizedResponse.structuredData.messageType}`);
            const hasTool = session.core.hasToolForCurrentInstruction(categorizedResponse.structuredData.messageType);
            console.log(`⭐ AbstractClassifier: Has tool for instruction ${categorizedResponse.structuredData.messageType}? ${hasTool}`);
            
            if (hasTool) {
              const toolName = session.core.getToolForInstruction(categorizedResponse.structuredData.messageType);
              console.log(`⭐ AbstractClassifier: Found mapped tool: ${toolName} for instruction: ${categorizedResponse.structuredData.messageType}`);
              session.triggerEventHandlers(categorizedResponse.structuredData);
              if (categorizedResponse.textData) {
                session.triggerConversationHandlers(categorizedResponse.textData);
              }
            } else {
              console.log(`⭐ AbstractClassifier: No tool found for instruction: ${categorizedResponse.structuredData.messageType}`);

              // If no tool exists, treat both content and answer as conversation
              session.triggerConversationHandlers(categorizedResponse.structuredData);
              if (categorizedResponse.textData) {
                session.triggerConversationHandlers(categorizedResponse.textData);
              }
            }
            break;

          case ResponseType.CONVERSATION:
            session.triggerConversationHandlers(categorizedResponse.textData);
            break;

          case ResponseType.ROUTING:
            session.triggerRoutingHandlers(categorizedResponse.structuredData);
            if (categorizedResponse.textData) {
              session.triggerConversationHandlers(categorizedResponse.textData);
            }
            break;

          case ResponseType.EXCEPTION:
            // Exception because of LLM response parse error so obviously
            // the response cannot be structured. Let's treat it as text content
            //session.triggerExceptionHandlers(categorizedResponse.textData);
            break;

          default:
            logger.warn(`Unhandled response type: ${categorizedResponse.type}`);
            // Fall through to legacy parsing
            break;
        }
        return categorizedResponse.type;
      }

      // Fall back to legacy parsing if categorization returns null
      const { isToolCall, instruction, parsedLLMResponse, answer } = 
        this.parseLLMResponse(response);
      
      // For legacy parsing, add the tool call ID to the parsed response if it's a tool call
      if (isToolCall && toolCallInfo.id) {
        (parsedLLMResponse as any).id = toolCallInfo.id;
      }
            
      if (isToolCall) {
        session.triggerToolCallsHandlers(parsedLLMResponse);
        return ResponseType.TOOL_CALL;
      } else if (session.core.hasToolForCurrentInstruction(instruction)) {
        session.triggerEventHandlers(parsedLLMResponse);
        session.triggerConversationHandlers(answer);
        return ResponseType.EVENT;
      } else {
        session.triggerConversationHandlers(parsedLLMResponse);
        session.triggerConversationHandlers(answer);
        return ResponseType.CONVERSATION;
      }
    } catch (error) {
      this.handleParsingError(error, response, session);
      return ResponseType.EXCEPTION;
    }
  }

  protected tryExtractMessageType(response: string): string | undefined {
    const messageTypeRegex = /"messageType"\s*:\s*"([^"]+)"/;
    const match = response.match(messageTypeRegex);
    return match ? match[1] : undefined;
  }

  protected handleParsingError(
    error: unknown,
    originalResponse: string,
    session: Session,
    instruction?: string
  ): void {
    session.triggerExceptionHandlers({
      messageType: instruction || 'LLM_RESPONSE_PARSE_ERROR',
      error: error instanceof Error ? error.message : String(error),
      originalResponse: originalResponse,
      originalError: error
    } as InferClassificationUnion<T>);
  }
}
