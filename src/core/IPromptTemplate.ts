import { ClassificationTypeConfig } from "./IClassifier";
import { PromptManager } from "./PromptManager";
import { SessionContext } from "./SessionContext";

export interface IAgentPromptTemplate {
  getSystemPrompt(sessionContext: SessionContext): Promise<string>;
  getAssistantPrompt(sessionContext: SessionContext): Promise<string>;
  getMessageClassificationPrompt(message: string): string;
  getMetaPrompt(): string;
  getClassificationTypes(): ReadonlyArray<ClassificationTypeConfig>;
  extractDataFromLLMResponse(response: string): string;
  debugPrompt(
    promptManager: PromptManager,
    type: "system" | "assistant",
    sessionContext: SessionContext
  ): Promise<string>;
}
