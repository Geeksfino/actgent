// IClassifier.ts
import { Session } from './Session';
import { InferClassificationUnion } from './TypeInference';  
import { ResponseType } from './ResponseTypes';

export interface ClassificationTypeConfig {
    name: string;
    description: string;
    schema: Record<string, any>;
}

export type InferMessageType<T extends readonly ClassificationTypeConfig[], K extends T[number]['name']> = 
  Extract<InferClassificationUnion<T>, { messageType: K }>;

export type ClassifiedTypeHandlers<T extends readonly ClassificationTypeConfig[]> = {
    [K in T[number]['name']]: (result: InferMessageType<T, K>, session: Session) => void;
};

export interface IClassifier<T extends readonly ClassificationTypeConfig[]> {
    getClassificationTypeDefinition(): Readonly<T>;
    handleLLMResponse(response: string, session: Session): ResponseType;
}

