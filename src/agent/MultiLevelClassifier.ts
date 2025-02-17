import { ClassificationTypeConfig } from "../core/IClassifier";
import { AbstractClassifier } from "../core/AbstractClassifier";
import { InferClassificationUnion } from "../core/TypeInference";
import { withTags } from "../core/Logger";
import { agentLoggers } from "./logging";
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
    const classifierLogger = agentLoggers.classifier

    try {
      classifierLogger.debug("Attempting to categorize LLM response",
        withTags(['multi-level']), {
        responseLength: response.length,
        firstChars: response.substring(0, 50)
      });

      // First try to parse as JSON
      let parsed;
      try {
        parsed = JSON.parse(response);
        classifierLogger.debug("Successfully parsed response into JSON",
          withTags(['multi-level'])
        );
      } catch (error) {
        // Not JSON, treat as conversation
        classifierLogger.debug("Non-JSON response, treating as conversation",
          withTags(['multi-level'])
        );
        return {
          type: ResponseType.CONVERSATION,
          structuredData: {
            messageType: 'CONVERSATION',
            response: response
          } as InferClassificationUnion<T>,
          textData: response
        };
      }

      // Case 1: Multi-level intent format
      if (parsed.top_level_intent) {
        const topLevelIntent = parsed.top_level_intent.toUpperCase();
        classifierLogger.debug("Found top_level_intent", 
          withTags(['multi-level']), { intent: topLevelIntent });

        // Handle CONVERSATION intent
        if (topLevelIntent === 'CONVERSATION') {
          if (!parsed.response) {
            const error = "Invalid CONVERSATION response: response field is missing";
            classifierLogger.warn(error, withTags(['multi-level']));
            throw new Error(error);
          }

          classifierLogger.debug("Categorized as CONVERSATION response");
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
            const error = "Invalid ACTION response: second_level_intent is missing";
            classifierLogger.warn(error, withTags(['multi-level']));
            throw new Error(error);
          }

          classifierLogger.debug("Categorized as ACTION response", {
            action: parsed.second_level_intent
          });
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
        const toolCall = parsed.tool_calls[0];
        if (!toolCall || !toolCall.function) {
          const error = "Invalid tool_calls format: missing function data";
          classifierLogger.warn(error, withTags(['multi-level']));
          throw new Error(error);
        }

        classifierLogger.debug("Categorized as TOOL_CALL response", {
          toolName: toolCall.function.name
        });
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
        classifierLogger.debug("Found direct schema response", {
          messageType: parsed.messageType
        });
        // If it's not a conventional tool call (handled in case 2),
        // treat it as instruction-to-tool mapping for event handling
        const matchingSchema = this.schemaTypes.find(
          (type: ClassificationTypeConfig) => type.name === parsed.messageType
        );
        // No need to throw error if no matching schema - just return EVENT type
        classifierLogger.debug("Categorized LLM response as structured output");
        return {
          type: ResponseType.EVENT,
          structuredData: parsed as InferClassificationUnion<T>,
          textData: parsed.response,
        };
      }

      // If we reach here, the response format is unrecognized
      classifierLogger.error("Unrecognized LLM response format: ", response);
      return {
        type: ResponseType.EXCEPTION,
        instruction: this.tryExtractMessageType(response),
        structuredData: {
          messageType: 'EXCEPTION',
          structuredData: parsed
        } as InferClassificationUnion<T>,
      };

    } catch (error) {
      classifierLogger.error("Error parsing LLM response:", error);
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
