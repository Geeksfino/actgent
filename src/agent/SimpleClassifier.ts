import { ClassificationTypeConfig } from "../core/IClassifier";
import { AbstractClassifier } from "../core/AbstractClassifier";
import { InferClassificationUnion } from "../core/TypeInference";
import { logger } from "../core/Logger";

export class SimpleClassifier<T extends readonly ClassificationTypeConfig[]> extends AbstractClassifier<T> {
  constructor(schemaTypes: T) {
    super(schemaTypes);
  }

  protected parseLLMResponse(
    response: string
  ): {
    isToolCall: boolean;
    instruction: string | undefined;
    parsedLLMResponse: InferClassificationUnion<T>;
    answer: string | undefined;
  } {
    try {
      // Try to parse the response as JSON
      const parsed = JSON.parse(response);

      // Validate that the response has a messageType that matches one of our schema types
      const messageType = parsed.messageType;
      if (!messageType) {
        throw new Error("Response missing messageType");
      }

      const matchingSchema = this.schemaTypes.find(type => type.name === messageType);
      if (!matchingSchema) {
        throw new Error(`Unknown messageType: ${messageType}`);
      }

      return {
        isToolCall: messageType === "TOOL_INVOCATION",
        instruction: messageType,
        parsedLLMResponse: parsed as InferClassificationUnion<T>,
        answer: parsed.content
      };
    } catch (error) {
      logger.error("Error parsing LLM response:", error);
      throw error;
    }
  }

  protected tryExtractMessageType(response: string): string | undefined {
    try {
      const parsed = JSON.parse(response);
      return parsed.messageType;
    } catch {
      return undefined;
    }
  }
}
