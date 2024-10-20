import { ClassificationTypeConfig } from "./IClassifier";

export interface IAgentPromptTemplate {
  getSystemPrompt(): string;
  getAssistantPrompt(): string;
  getMessageClassificationPrompt(message: string): string;
  getMetaPrompt(): string;
  getClassificationTypes(): ReadonlyArray<ClassificationTypeConfig>;
}
