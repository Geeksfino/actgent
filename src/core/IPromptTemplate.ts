import { ClassificationTypeConfig } from "./IClassifier";
import { Memory } from "./Memory";
import { SessionContext } from "./SessionContext";
import { InferClassificationUnion } from "./TypeInference";

export interface IAgentPromptTemplate {
  getSystemPrompt(sessionContext: SessionContext, memory: Memory): string;
  getAssistantPrompt(sessionContext: SessionContext, memory: Memory): string;
  getMessageClassificationPrompt(message: string): string;
  getMetaPrompt(): string;
  getClassificationTypes(): ReadonlyArray<ClassificationTypeConfig>;
  extractFromLLMResponse<T extends readonly ClassificationTypeConfig[]>(response: string): string;
}
