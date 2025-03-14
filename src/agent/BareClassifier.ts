import { AbstractClassifier } from "../core/AbstractClassifier";
import { ClassificationTypeConfig } from "../core/IClassifier";
import { BarePromptTemplate } from "./BarePromptTemplate";
import { InferStrategy } from "../core/InferContext";
import { InferClassificationUnion } from "../core/TypeInference";
import { ResponseType, ParsedLLMResponse } from "../core/ResponseTypes";
import { withTags } from "../core/Logger";
import { agentLoggers } from "./logging";

export class BareClassifier<T extends readonly ClassificationTypeConfig[]> extends AbstractClassifier<T> {
  protected promptTemplate: BarePromptTemplate<T>;

  constructor(schemaTypes: T, strategy?: InferStrategy) {
    super(schemaTypes);
    this.promptTemplate = new BarePromptTemplate(schemaTypes, strategy);
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
        withTags(['bare']), {
        responseLength: response.length,
        firstChars: response.substring(0, 50)
      });

      // First try to parse as JSON
      let parsed;
      try {
        parsed = JSON.parse(response);
        classifierLogger.debug("Successfully parsed response into JSON",
          withTags(['bare'])
        );
      } catch (error) {
        // Not JSON, treat as conversation
        classifierLogger.debug("Non-JSON response, treating as conversation",
          withTags(['bare'])
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

      // Handle OpenAI function calling formats
      
      // Format 1: Object with tool_calls property
      if (parsed.tool_calls) {
        const toolCall = parsed.tool_calls[0];
        if (!toolCall || !toolCall.function) {
          const error = "Invalid tool_calls format: missing function data";
          classifierLogger.warn(error, withTags(['bare']));
          throw new Error(error);
        }

        classifierLogger.debug("Categorized as TOOL_CALL response (format 1)", {
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
      
      // Format 2: Direct array of tool calls
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].function) {
        const toolCall = parsed[0];
        if (!toolCall.function) {
          const error = "Invalid array tool call format: missing function data";
          classifierLogger.warn(error, withTags(['bare']));
          throw new Error(error);
        }
        
        classifierLogger.debug("Categorized as TOOL_CALL response (format 2)", {
          toolName: toolCall.function.name
        });
        return {
          type: ResponseType.TOOL_CALL,
          structuredData: {
            messageType: 'TOOL_INVOCATION',
            toolName: toolCall.function.name,
            arguments: JSON.parse(toolCall.function.arguments)
          } as InferClassificationUnion<T>,
          textData: "",
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
    }   // not used
    return null;
  }
}
