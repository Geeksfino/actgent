type LLMClassificationType = 'SIMPLE_QUERY' | 'COMPLEX_TASK' | 'CLARIFICATION_NEEDED' | 'COMMAND';

interface SimpleQuery {
  messageType: 'SIMPLE_QUERY';
  answer: string;
}

interface ComplexTask {
  messageType: 'COMPLEX_TASK';
  actionPlan: {
    task: string;
    subtasks: string[];
  };
}

interface ClarificationNeeded {
  messageType: 'CLARIFICATION_NEEDED';
  questions: string[];
}

interface Command    {
  messageType: 'COMMAND';
  command: {
    action: string;
    parameters: Record<string, string>;
    expectedOutcome: string;
  };
}

type LLMClassification = SimpleQuery | ComplexTask | ClarificationNeeded | Command;

interface AgentPromptTemplate {
    getSystemPrompt(): string;
    getAssistantPrompt(): string;
    getMessageClassificationPrompt(message: string): string;
}

export { AgentPromptTemplate, LLMClassificationType, LLMClassification };
