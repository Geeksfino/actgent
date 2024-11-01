// AbstractClassifier.ts
import {
  IClassifier,
  ClassificationTypeConfig,
} from "./IClassifier";
import { Session } from "./Session";
import { InferClassificationUnion } from "./TypeInference";

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

  // public abstract getClassificationTypeHandlers(): ClassifiedTypeHandlers<T>;

  public handleLLMResponse(
    response: string,
    session: Session
  ): void {
    const { isToolCall, parsedLLMResponse } = this.parseLLMResponse(response);
    if (isToolCall) {
      session.triggerToolCallsHandlers(parsedLLMResponse);
    } else {
      session.triggerEventHandlers(parsedLLMResponse);
    }
  }

  protected abstract parseLLMResponse(response: string): {
    isToolCall: boolean;
    parsedLLMResponse: InferClassificationUnion<T>;
  };
}
