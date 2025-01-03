import { ClassificationTypeConfig } from "../core/IClassifier";
import { AbstractClassifier } from "../core/AbstractClassifier";
import { InferClassificationUnion } from "../core/TypeInference";
import { ValidationResult, ValidationOptions } from "../core/types/ValidationResult";
import { logger } from "../core/Logger";
import { MultiLevelPromptTemplate } from "./MultiLevelPromptTemplate";
import { ResponseType, ParsedLLMResponse } from "../core/ResponseTypes";
import { Message } from "../core/Message";

export class MultiLevelClassifier<T extends readonly ClassificationTypeConfig[]> extends AbstractClassifier<T> {
  protected promptTemplate: MultiLevelPromptTemplate<T>;

  constructor(schemaTypes: T) {
    super(schemaTypes);
    this.promptTemplate = new MultiLevelPromptTemplate(schemaTypes);
  }

  protected parseLLMResponse(
    response: string,
    validationOptions: ValidationOptions
  ): {
    isToolCall: boolean;
    instruction: string | undefined;
    parsedLLMResponse: InferClassificationUnion<T>;
    answer: string | undefined;
    validationResult: ValidationResult<InferClassificationUnion<T>>;
  } {
    const categorized = this.categorizeLLMResponse(response, validationOptions);
    
    if (!categorized) {
      throw new Error("Failed to categorize response");
    }

    return null as any;
  }

  protected categorizeLLMResponse(
    response: string,
    validationOptions: ValidationOptions
  ): ParsedLLMResponse<T> | null {
    try {
      const parsed = JSON.parse(response);

      // Case 1: Multi-level intent format
      if (parsed.top_level_intent) {
        const topLevelIntent = parsed.top_level_intent.toUpperCase();

        // Handle CONVERSATION intent
        if (topLevelIntent === 'CONVERSATION') {
          if (!parsed.response) {
            throw new Error("Invalid CONVERSATION response: response field is missing");
          }

          return {
            type: ResponseType.CONVERSATION,
            content: {
              messageType: 'CONVERSATION',
              response: parsed.response
            } as InferClassificationUnion<T>,
            answer: parsed.response,
            validationResult: { 
              isValid: true, 
              data: {
                messageType: 'CONVERSATION',
                response: parsed.response
              } as InferClassificationUnion<T>
            }
          };
        }

        // Handle ACTION intent
        if (topLevelIntent === 'ACTION') {
          if (!parsed.second_level_intent) {
            throw new Error("Invalid ACTION response: second_level_intent is missing");
          }

          return {
            type: ResponseType.ROUTING,
            content: {
              messageType: 'ROUTE',
              action: parsed.second_level_intent,
              data: parsed
            } as InferClassificationUnion<T>,
            answer: parsed.response,
            validationResult: { 
              isValid: true, 
              data: {
                messageType: 'ROUTE',
                action: parsed.second_level_intent,
                data: parsed
              } as InferClassificationUnion<T>
            }
          };
        }
      }

      // Case 2: OpenAI function calling format
      if (parsed.tool_calls) {
        // OpenAI returns tool_calls array, we handle the first one for now
        const toolCall = parsed.tool_calls[0];
        if (!toolCall || !toolCall.function) {
          throw new Error("Invalid tool_calls format: missing function data");
        }

        return {
          type: ResponseType.TOOL_CALL,
          content: {
            messageType: 'TOOL_INVOCATION',
            toolName: toolCall.function.name,
            arguments: JSON.parse(toolCall.function.arguments)
          } as InferClassificationUnion<T>,
          answer: parsed.response_description,
          validationResult: { 
            isValid: true, 
            data: {
              messageType: 'TOOL_INVOCATION',
              toolName: toolCall.function.name,
              arguments: JSON.parse(toolCall.function.arguments)
            } as InferClassificationUnion<T>
          }
        };
      }

      // Case 3: Direct schema-conforming response
      if (parsed.messageType) {
        // If it's not a conventional tool call (handled in case 2),
        // treat it as instruction-to-tool mapping for event handling
        const matchingSchema = this.schemaTypes.find(
          (type: ClassificationTypeConfig) => type.name === parsed.messageType
        );
        // No need to throw error if no matching schema - just return EVENT type
        return {
          type: ResponseType.EVENT,
          content: parsed as InferClassificationUnion<T>,
          answer: undefined,
          validationResult: {
            isValid: true,
            data: parsed as InferClassificationUnion<T>
          }
        };
      }

      // If we reach here, the response format is unrecognized
      throw new Error("Unrecognized response format");

    } catch (error) {
      logger.error("Error parsing LLM response:", error);
      return {
        type: ResponseType.EXCEPTION,
        content: {
          messageType: 'LLM_RESPONSE_PARSE_ERROR',
          error: error instanceof Error ? error.message : String(error)
        } as InferClassificationUnion<T>,
        validationResult: {
          isValid: false,
          error: error instanceof Error ? error.message : String(error),
          originalContent: response,
          data: null
        }
      };
    }
  }
}
