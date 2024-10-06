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

  public abstract getClassificationTypeDefinition(): Readonly<T>; // Returns T, which is readonly

  public abstract getClassificationTypeHandlers(): ClassifiedTypeHandlers<T>;

  public handleLLMResponse(
    response: InferClassificationUnion<T>,
    session: Session
  ): void {
    const callbacks = this.getClassificationTypeHandlers();

    const callback =
      callbacks[response.messageType as keyof typeof callbacks];
    if (callback) {
      callback(response);
    } else {
      console.log(
        `No callback defined for message type: ${response.messageType}`
      );
    }
  }
}
