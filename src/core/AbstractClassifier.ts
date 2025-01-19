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

  public handleLLMResponse(
    response: string,
    session: Session
  ): ResponseType {
    try {
      // Try the new categorization first
      const categorizedResponse = this.categorizeLLMResponse(response);
      
      if (categorizedResponse) {
        // Route response based on type
        switch (categorizedResponse.type) {
          case ResponseType.TOOL_CALL:
            session.triggerToolCallsHandlers(categorizedResponse.structuredData);
            if (categorizedResponse.textData) {
              session.triggerConversationHandlers(categorizedResponse.textData);
            }
            break;

          case ResponseType.EVENT:
            if (session.core.hasToolForCurrentInstruction(categorizedResponse.structuredData.messageType)) {
              session.triggerEventHandlers(categorizedResponse.structuredData);
              if (categorizedResponse.textData) {
                session.triggerConversationHandlers(categorizedResponse.textData);
              }
            } else {
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
            session.triggerExceptionHandlers(categorizedResponse.textData);
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
