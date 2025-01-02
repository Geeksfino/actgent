// AbstractClassifier.ts
import {
  IClassifier,
  ClassificationTypeConfig,
} from "./IClassifier";
import { Session } from "./Session";
import { InferClassificationUnion } from "./TypeInference";
import { ValidationResult, ValidationOptions } from './types/ValidationResult';
import { logger } from './Logger';
import { ParsedLLMResponse, ResponseType } from "./ResponseTypes";

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
    response: string,
    validationOptions: ValidationOptions
  ): {
    isToolCall: boolean;
    instruction: string | undefined;
    parsedLLMResponse: InferClassificationUnion<T>;
    answer: string | undefined;
    validationResult: ValidationResult<InferClassificationUnion<T>>;
  };

  protected categorizeLLMResponse(
    response: string,
    validationOptions: ValidationOptions
  ): ParsedLLMResponse<T> | null {
    // Default implementation returns null to indicate not implemented
    return null;
  }

  public handleLLMResponse(
    response: string,
    session: Session
  ): void {
    try {
      // Try the new categorization first
      const categorizedResponse = this.categorizeLLMResponse(response, {
        level: 'lenient',
        allowPartialMatch: true,
        requireMessageType: true
      });
      
      if (categorizedResponse) {
        // Route response based on type
        switch (categorizedResponse.type) {
          case ResponseType.TOOL_CALL:
            session.triggerToolCallsHandlers(categorizedResponse.content);
            if (categorizedResponse.answer) {
              session.triggerConversationHandlers(categorizedResponse.answer);
            }
            break;

          case ResponseType.EVENT:
            if (session.core.hasToolForCurrentInstruction(categorizedResponse.content.messageType)) {
              session.triggerEventHandlers(categorizedResponse.content);
              if (categorizedResponse.answer) {
                session.triggerConversationHandlers(categorizedResponse.answer);
              }
            } else {
              // If no tool exists, treat both content and answer as conversation
              session.triggerConversationHandlers(categorizedResponse.content);
              if (categorizedResponse.answer) {
                session.triggerConversationHandlers(categorizedResponse.answer);
              }
            }
            break;

          case ResponseType.CONVERSATION:
            session.triggerConversationHandlers(categorizedResponse.content);
            break;

          case ResponseType.ROUTING:
            session.triggerRoutingHandlers(categorizedResponse.content);
            if (categorizedResponse.answer) {
              session.triggerConversationHandlers(categorizedResponse.answer);
            }
            break;

          case ResponseType.EXCEPTION:
            session.triggerExceptionHandlers(categorizedResponse.content);
            break;

          default:
            logger.warn(`Unhandled response type: ${categorizedResponse.type}`);
            // Fall through to legacy parsing
            break;
        }
        return;
      }

      // Fall back to legacy parsing if categorization returns null
      const { isToolCall, instruction, parsedLLMResponse, answer } = 
        this.parseLLMResponse(response, {
          level: 'lenient',
          allowPartialMatch: true,
          requireMessageType: true
      });
            
      if (isToolCall) {
        session.triggerToolCallsHandlers(parsedLLMResponse);
      } else if (session.core.hasToolForCurrentInstruction(instruction)) {
        session.triggerEventHandlers(parsedLLMResponse);
        session.triggerConversationHandlers(answer);
      } else {
        session.triggerConversationHandlers(parsedLLMResponse);
        session.triggerConversationHandlers(answer);
      }
    } catch (error) {
      this.handleParsingError(error, response, session);
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
