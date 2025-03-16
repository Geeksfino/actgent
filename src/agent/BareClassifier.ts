import { AbstractClassifier } from "../core/AbstractClassifier";
import { ClassificationTypeConfig } from "../core/IClassifier";
import { BarePromptTemplate } from "./BarePromptTemplate";
import { InferStrategy } from "../core/InferContext";
import { InferClassificationUnion } from "../core/TypeInference";
import { ResponseType, ParsedLLMResponse } from "../core/ResponseTypes";
import { withTags } from "../core/Logger";
import { agentLoggers } from "./logging";

const classifierLogger = agentLoggers.classifier;

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

      // Tool call handling is done in AbstractClassifier
      
      // Handle simple string/primitive responses
      if (typeof parsed === 'string' || typeof parsed === 'number' || typeof parsed === 'boolean') {
        classifierLogger.debug("Detected simple primitive response, treating as conversation", 
          withTags(['bare']), { responseType: typeof parsed });
        return {
          type: ResponseType.CONVERSATION,
          structuredData: {
            messageType: 'CONVERSATION',
            response: parsed.toString()
          } as InferClassificationUnion<T>,
          textData: parsed.toString()
        };
      }
      
      // Handle simple object with text/content property (common in streaming responses)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        // Check for common response patterns
        if (parsed.text !== undefined || parsed.content !== undefined) {
          const content = parsed.text !== undefined ? parsed.text : parsed.content;
          classifierLogger.debug("Detected object with text/content property, treating as conversation", 
            withTags(['bare']), { responseType: 'object-with-text' });
          return {
            type: ResponseType.CONVERSATION,
            structuredData: {
              messageType: 'CONVERSATION',
              response: content.toString()
            } as InferClassificationUnion<T>,
            textData: content.toString()
          };
        }
        
        // Handle empty objects or objects with no recognized properties
        // This often happens in stream mode with special token formats
        if (Object.keys(parsed).length === 0) {
          classifierLogger.debug("Detected empty object response, treating as empty conversation", 
            withTags(['bare']), { responseType: 'empty-object' });
          return {
            type: ResponseType.CONVERSATION,
            structuredData: {
              messageType: 'CONVERSATION',
              response: ''
            } as InferClassificationUnion<T>,
            textData: ''
          };
        }
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
