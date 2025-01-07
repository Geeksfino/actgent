import { AbstractClassifier } from "../core/AbstractClassifier";
import { ClassificationTypeConfig } from "../core/IClassifier";
import { Message } from "../core/Message";
import { BarePromptTemplate } from "./BarePromptTemplate";
import { InferStrategy } from "../core/InferContext";
import { InferClassificationUnion } from "../core/TypeInference";
import { logger } from "../core/Logger";

export class BareClassifier<T extends readonly ClassificationTypeConfig[]> extends AbstractClassifier<T> {
  protected promptTemplate: BarePromptTemplate<T>;

  constructor(schemaTypes: T, strategy?: InferStrategy) {
    super(schemaTypes);
    this.promptTemplate = new BarePromptTemplate(schemaTypes, strategy);
  }

  /*
  async classify(message: Message): Promise<string> {
    // Always return the first classification type
    return this.schemaTypes[0].name;
  }
    */

  protected parseLLMResponse(
    response: string
  ): {
    isToolCall: boolean;
    instruction: string | undefined;
    parsedLLMResponse: InferClassificationUnion<T>;
    answer: string | undefined;
  } {
    try {
      // For bare classifier, treat all responses as direct answers
      const firstType = this.schemaTypes[0];
      const parsed = {
        messageType: firstType.name,
        content: response
      } as InferClassificationUnion<T>;

      return {
        isToolCall: false,
        instruction: firstType.name,
        parsedLLMResponse: parsed,
        answer: response
      };
    } catch (error) {
      logger.error("Error parsing LLM response:", error);
      throw error;
    }
  }
}
