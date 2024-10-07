import { ClassificationTypeConfig } from './IClassifier';

export type InferClassificationType<T extends ClassificationTypeConfig> =
  T extends { name: infer Name, schema: infer Structure }
    ? { messageType: Name } & Structure
    : never;

export type InferClassificationUnion<T extends ReadonlyArray<ClassificationTypeConfig>> =
  T extends ReadonlyArray<infer U>
    ? U extends ClassificationTypeConfig
      ? InferClassificationType<U>
      : never
    : never;