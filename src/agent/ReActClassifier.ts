import { ClassificationTypeConfig } from "../core/IClassifier";
import { AbstractClassifier } from "../core/AbstractClassifier";
import { InferClassificationUnion } from "../core/TypeInference";


export class ReActClassifier<T extends readonly ClassificationTypeConfig[]> extends AbstractClassifier<T> {
  constructor(schemaTypes: T) {
    super(schemaTypes);
  }

  protected parseLLMResponse(response: string): InferClassificationUnion<T> {
    try {
      const parsed = JSON.parse(response);
      if (parsed && typeof parsed === 'object' && 'action' in parsed && 'response_content' in parsed.action) {
        return parsed.action.response_content as InferClassificationUnion<T>;
      } else {
        throw new Error("Invalid response format: action or response_content is missing");
      }
    } catch (error) {
      console.error("Error parsing LLM response:", error);
      throw error;
    }
  }
}
