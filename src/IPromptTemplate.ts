import { ClassificationTypeConfig } from "./IClassifier";

export interface IAgentPromptTemplate {
  getSystemPrompt(): string;
  getAssistantPrompt(): string;
  getMessageClassificationPrompt(message: string): string;
  getClassificationTypes(): ReadonlyArray<ClassificationTypeConfig>;
}
