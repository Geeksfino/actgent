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
  constructor() {}

  public abstract getClassificationTypeDefinition(): Readonly<T>;

  // public abstract getClassificationTypeHandlers(): ClassifiedTypeHandlers<T>;

  public handleLLMResponse(
    response: string | InferClassificationUnion<T>,
    session: Session
  ): void {
    if (response && typeof response === 'object' && 'messageType' in response) {
      session.triggerEventHandlers(response);
    } else {
      console.log("Invalid response format: messageType is missing or response is not an object");
    }
  }
}
