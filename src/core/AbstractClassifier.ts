// AbstractClassifier.ts
import {
  IClassifier,
  ClassificationTypeConfig,
} from "./IClassifier";
import { Session } from "./Session";
import { InferClassificationUnion } from "./TypeInference";
import { ValidationResult, ValidationOptions } from './types/ValidationResult';
import { logger } from './Logger';

export abstract class AbstractClassifier<T extends readonly ClassificationTypeConfig[]>
  implements IClassifier<T>
{  
  protected schemaTypes: T;

  constructor(schemaTypes: T) {
    this.schemaTypes = schemaTypes;
  }

  public getClassificationTypeDefinition(): Readonly<T> {
    return this.schemaTypes as Readonly<T>;
  }

  public handleLLMResponse(
    response: string,
    session: Session
  ): void {
    try {
      const { isToolCall, instruction, parsedLLMResponse, answer, validationResult } = 
        this.parseLLMResponse(response, {
          level: 'lenient',  // Initial parsing with lenient validation
          allowPartialMatch: true,
          requireMessageType: true
      });
            
      if (isToolCall) {
        session.triggerToolCallsHandlers(parsedLLMResponse);
      } else if (session.core.hasToolForCurrentInstruction(instruction)) { // if the instruction is a tool call, trigger the tool call handlers
        session.triggerEventHandlers(parsedLLMResponse);
        session.triggerConversationHandlers(answer);
      } else {
        session.triggerConversationHandlers(parsedLLMResponse);
        session.triggerConversationHandlers(answer);
      }
    } catch (error) {
      const extractedInstruction = this.tryExtractMessageType(response);
      session.triggerExceptionHandlers({
        messageType: extractedInstruction || 'LLM_RESPONSE_PARSE_ERROR',
        error: error instanceof Error ? error.message : String(error),
        originalResponse: response,
        originalError: error // Pass the original error object
      } as InferClassificationUnion<T>)
    }
  }

  protected tryExtractMessageType(response: string): string | undefined {
    const messageTypeRegex = /"messageType"\s*:\s*"([^"]+)"/;
    const match = response.match(messageTypeRegex);
    return match ? match[1] : undefined;
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

  protected handleParsingError(
    error: unknown,
    originalResponse: string,
    session: Session,
    instruction?: string
  ): void {
    session.triggerEventHandlers({
      messageType: instruction || 'LLM_RESPONSE_PARSE_ERROR',
      error: error instanceof Error ? error.message : String(error),
      originalResponse: originalResponse,
      originalError: error
    } as InferClassificationUnion<T>);
  }
}
