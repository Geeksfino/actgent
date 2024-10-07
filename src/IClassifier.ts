// IClassifier.ts
import { Session } from './Session';
import { InferClassificationUnion } from './TypeInference';  

export interface ClassificationTypeConfig {
    name: string;
    prompt: string;
    schema: Record<string, any>;
}

export type InferMessageType<T extends readonly ClassificationTypeConfig[], K extends T[number]['name']> = 
  Extract<InferClassificationUnion<T>, { messageType: K }>;

export type ClassifiedTypeHandlers<T extends readonly ClassificationTypeConfig[]> = {
    [K in T[number]['name']]: (result: InferMessageType<T, K>, session: Session) => void;
};

export interface IClassifier<T extends readonly ClassificationTypeConfig[]> {
    getClassificationTypeDefinition(): Readonly<T>;
    //getClassificationTypeHandlers(): ClassifiedTypeHandlers<Readonly<T>>;
    handleLLMResponse(response: InferClassificationUnion<Readonly<T>>, session: Session): void;
}

