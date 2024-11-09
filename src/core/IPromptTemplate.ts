import { ClassificationTypeConfig } from "./IClassifier";
import { Memory } from "./Memory";
import { PromptManager } from "./PromptManager";
import { SessionContext } from "./SessionContext";

export interface IAgentPromptTemplate {
  getSystemPrompt(sessionContext: SessionContext, memory: Memory): string;
  getAssistantPrompt(sessionContext: SessionContext, memory: Memory): string;
  getMessageClassificationPrompt(message: string): string;
  getMetaPrompt(): string;
  getClassificationTypes(): ReadonlyArray<ClassificationTypeConfig>;
  extractFromLLMResponse(response: string): string;
  debugPrompt(promptManager: PromptManager, type: "system" | "assistant", sessionContext: SessionContext, memory: Memory): string;
}
