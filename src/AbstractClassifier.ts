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
    response: string | InferClassificationUnion<T>,
    session: Session
  ): void {
    // console.log("AbstractClassifier handling LLM Response:");
    // console.log("Response type:", typeof response);
    // console.log("Response content:", JSON.stringify(response, null, 2));
    // console.log("Response keys:", Object.keys(response));
    // console.log("messageType:", (response as any).messageType);

    const callbacks = this.getClassificationTypeHandlers();

    if (response && typeof response === 'object' && 'messageType' in response) {
      const callback = callbacks[response.messageType as keyof typeof callbacks];
      if (callback) {
        callback(response as any, session);
      } else {
        console.log(`No callback defined for message type: ${response.messageType}`);
      }
    } else {
      console.log("Invalid response format: messageType is missing or response is not an object");
    }
  }
}
