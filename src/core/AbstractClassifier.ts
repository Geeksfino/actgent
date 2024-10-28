// AbstractClassifier.ts
import {
  IClassifier,
  ClassifiedTypeHandlers,
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
    response: any,
    session: Session
  ): void {
    const parsedResponse = this.parseLLMResponse(response);
    session.triggerEventHandlers(parsedResponse);
    // if (response && typeof response === 'object' && 'messageType' in response) {
    //   session.triggerEventHandlers(response);
    // } else {
    //   console.log("Invalid response format: messageType is missing or response is not an object");
    // }
  }

  protected abstract parseLLMResponse(response: any): InferClassificationUnion<T>;
}
