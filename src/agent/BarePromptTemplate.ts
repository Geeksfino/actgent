import { IAgentPromptTemplate } from "../core/IPromptTemplate";
import { ClassificationTypeConfig } from "../core/IClassifier";
import { PromptManager } from "../core/PromptManager";
import { SessionContext } from "../core/SessionContext";
import { InferStrategy } from "../core/InferContext";

export class BarePromptTemplate<T extends ReadonlyArray<ClassificationTypeConfig>> implements IAgentPromptTemplate {
  protected classificationTypes: T;

  constructor(classificationTypes: T, _strategy?: InferStrategy) {
    this.classificationTypes = classificationTypes;
  }

  async getSystemPrompt(sessionContext: SessionContext): Promise<string> {
    return `
You are designated as: {role}
Your goal: {goal}
Your capabilities: {capabilities}
    `.trim();
  }

  async getAssistantPrompt(sessionContext: SessionContext): Promise<string> {
    return "";
  }

  getMessageClassificationPrompt(message: string): string {
    return "";
  }

  getMetaPrompt(): string {
    return "";
  }

  getClassificationTypes(): T {
    return this.classificationTypes;
  }

  extractDataFromLLMResponse(response: string): string {
    return response;
  }

  async debugPrompt(
    promptManager: PromptManager,
    type: "system" | "assistant",
    sessionContext: SessionContext
  ): Promise<string> {
    const prompt = type === "system" 
      ? await promptManager.getSystemPrompt(sessionContext) 
      : await promptManager.getAssistantPrompt(sessionContext);
    return prompt;
  }
}
