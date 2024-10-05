export interface ClassificationTypeConfig {
    name: string;
    description: string;
    structure: Record<string, any>;
  }
  
  export interface IAgentPromptTemplate {
    getSystemPrompt(): string;
    getAssistantPrompt(): string;
    getMessageClassificationPrompt(message: string): string;
    getClassificationTypes(): ReadonlyArray<ClassificationTypeConfig>;
  }