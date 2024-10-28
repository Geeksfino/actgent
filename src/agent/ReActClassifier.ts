import { ClassificationTypeConfig } from "../core/IClassifier";
import { AbstractClassifier } from "../core/AbstractClassifier";
import { InferClassificationUnion } from "../core/TypeInference";

export class DefaultClassifier<T extends readonly ClassificationTypeConfig[]> extends AbstractClassifier<T> {
  constructor(schemaTypes: T) {
    super(schemaTypes);
  }

  protected parseLLMResponse(response: any): InferClassificationUnion<T> {
    if (response && typeof response === 'object' && 'action' in response && 'response_content' in response.action) {
      return response.action.response_content;
    } else {
      throw new Error("Invalid response format: action or response_content is missing");
    }
  }
}
