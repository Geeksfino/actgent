import { IAgentPromptTemplate, ClassificationTypeConfig } from './IAgentPromptTemplate';

export class GenericPromptTemplate<T extends ReadonlyArray<ClassificationTypeConfig>> implements IAgentPromptTemplate {
  private classificationTypes: T;

  constructor(classificationTypes: T) {
    this.classificationTypes = classificationTypes;
  }

  getSystemPrompt(): string {
    return `
      You are a "{role}" with the goal of "{goal}". 
      Your capabilities are: {capabilities}.
      Your objective is to align every action with this overarching mission while processing specific tasks efficiently and effectively.
      Keep this goal in mind for every task you undertake. Decline any task that is not aligned with your goal or capabilities. 
    `;
  }

  getAssistantPrompt(): string {
    return "Assistant: ";
  }

  getMessageClassificationPrompt(message: string): string {
    const typesDescription = this.classificationTypes
      .map(type => `- ${type.name}: ${type.description}`)
      .join('\n');

    const jsonFormats = this.classificationTypes
      .map(type => `${type.name}:\n\`\`\`json\n${JSON.stringify({ messageType: type.name, ...type.structure }, null, 2)}\n\`\`\``)
      .join('\n\n');

    const prompt = `
    # Message Analysis Prompt
    
    Analyze the following message comprehensively. Categorize the message into one of these types:
    ${typesDescription}
    
    You shall first try to understand the user's intent to be sure that the user is asking something relevant to your role, goal and capabilities.
    If the user's intent is not clear or not relevant to your role, goal and capabilities, you shall ask for clarification.
    
    Based on the message type, provide a response in one of the following JSON formats:
    
    ${jsonFormats}
    
    Ensure that your response strictly adheres to these formats based on the identified message type. Provide concise yet comprehensive information within the constraints of each format.
   
    Now, analyze the following message:
    
    ${message}
    `;

    return prompt.trim();
  }

  getClassificationTypes(): T {
    return this.classificationTypes;
  }
}