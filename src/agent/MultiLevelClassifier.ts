import { ClassificationTypeConfig } from "../core/IClassifier";
import { AbstractClassifier } from "../core/AbstractClassifier";
import { InferClassificationUnion } from "../core/TypeInference";
import { ValidationResult, ValidationOptions } from "../core/types/ValidationResult";
import { logger } from "../core/Logger";
import { MultiLevelPromptTemplate } from "./MultiLevelPromptTemplate";
import { ResponseType, ParsedLLMResponse } from "../core/ResponseTypes";

export class MultiLevelClassifier<T extends readonly ClassificationTypeConfig[]> extends AbstractClassifier<T> {
  protected promptTemplate: MultiLevelPromptTemplate<T>;

  constructor(schemaTypes: T) {
    super(schemaTypes);
    this.promptTemplate = new MultiLevelPromptTemplate(schemaTypes);
  }

  protected parseLLMResponse(
    response: string
  ): {
    isToolCall: boolean;
    instruction: string | undefined;
    parsedLLMResponse: InferClassificationUnion<T>;
    answer: string | undefined;
  } {
    // not used
    return null as any;
  }

  protected categorizeLLMResponse(
    response: string
  ): ParsedLLMResponse<T> | null {
    try {
      logger.debug("Categorizing LLM raw response===>");
      const parsed = JSON.parse(response);
      logger.debug("Categorizing LLM response:", parsed);

      // Case 1: Multi-level intent format
      if (parsed.top_level_intent) {
        const topLevelIntent = parsed.top_level_intent.toUpperCase();

        // Handle CONVERSATION intent
        if (topLevelIntent === 'CONVERSATION') {
          if (!parsed.response) {
            throw new Error("Invalid CONVERSATION response: response field is missing");
          }

          logger.debug("Categorized LLM response as CONVERSATION");
          return {
            type: ResponseType.CONVERSATION,
            structuredData: {
              messageType: 'CONVERSATION',
              response: parsed.response
            } as InferClassificationUnion<T>,
            textData: parsed.response
          };
        }

        // Handle ACTION intent
        if (topLevelIntent === 'ACTION') {
          if (!parsed.second_level_intent) {
            throw new Error("Invalid ACTION response: second_level_intent is missing");
          }

          logger.debug("Categorized LLM response as ACTION");
          return {
            type: ResponseType.ROUTING,
            structuredData: {
              messageType: 'ROUTE',
              action: parsed.second_level_intent,
              data: parsed
            } as InferClassificationUnion<T>,
            textData: parsed.response,
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

        logger.debug("Categorized LLM response as TOOL_CALL");
        return {
          type: ResponseType.TOOL_CALL,
          structuredData: {
            messageType: 'TOOL_INVOCATION',
            toolName: toolCall.function.name,
            arguments: JSON.parse(toolCall.function.arguments)
          } as InferClassificationUnion<T>,
          textData: parsed.response,
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
        logger.debug("Categorized LLM response as structured output");
        return {
          type: ResponseType.EVENT,
          structuredData: parsed as InferClassificationUnion<T>,
          textData: parsed.response,
        };
      }

      // If we reach here, the response format is unrecognized
      logger.error("Unrecognized LLM response format: ", response);
      return {
        type: ResponseType.EXCEPTION,
        instruction: this.tryExtractMessageType(response),
        structuredData: {
          messageType: 'EXCEPTION',
          structuredData: parsed
        } as InferClassificationUnion<T>,
      };

    } catch (error) {
      logger.error("Error parsing LLM response:", error);
      return {
        type: ResponseType.EXCEPTION,
        structuredData: {
          messageType: 'EXCEPTION',
          error: error instanceof Error ? error.message : String(error)
        } as InferClassificationUnion<T>,
        textData: response,
      };
    }
  }
}
