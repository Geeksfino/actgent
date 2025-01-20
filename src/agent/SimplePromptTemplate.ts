import { IAgentPromptTemplate } from "../core/IPromptTemplate";
import { ClassificationTypeConfig } from "../core/IClassifier";
import { PromptManager } from "../core/PromptManager";
import { SessionContext } from "../core/SessionContext";
import { InferStrategy } from "../core/InferContext";

interface SchemaFormatting {
  types: string;
  schemas: string;
}

export class SimplePromptTemplate<T extends ReadonlyArray<ClassificationTypeConfig>> implements IAgentPromptTemplate {
  protected classificationTypes: T;

  constructor(classificationTypes: T, _strategy?: InferStrategy) {
    this.classificationTypes = classificationTypes;
  }

  private getFormattedSchemas(): SchemaFormatting {
    const types = this.classificationTypes
      .map((type) => `- ${type.name}: ${type.description}`)
      .join("\n");

    const schemas = this.classificationTypes
      .map(
        (type) =>
          `${type.name}:
\`\`\`json
${JSON.stringify({ messageType: type.name, ...type.schema }, null, 2)}
\`\`\`` + (type !== this.classificationTypes[this.classificationTypes.length - 1] ? " or " : "")
      )
      .join("\n\n");

    return { types, schemas };
  }

  async getSystemPrompt(sessionContext: SessionContext): Promise<string> {
    const base_prompt = `
You are designated as: {role}
Your goal: {goal}
Your capabilities: {capabilities}
    
Core Responsibilities:
1. Goal Alignment
   - Every action must support the defined goal
   - Stay within designated capabilities
   - Maintain role focus
    
2. Request Processing Framework
    A. Context Analysis
        - Extract core concepts and requirements
        - Consider conversation history
        - Validate goal alignment
    
    B. Clarity Protocol
        - Request clarification for ambiguous inputs
        - Explain capability limitations when relevant
        - Verify understanding for complex requests
    
    C. Response Structure
        Question Classification:
        - SIMPLE: Direct, straightforward requests
        - COMPLEX: Multi-step analysis requirements
    
        Response Types:
        - DIRECT_RESPONSE: Immediate answer using available information
        - TOOL_INVOCATION: Requires external data/actions
    
3. Tool Integration
       - Verify tool availability before requesting information
       - Ensure proper input formatting
       - Validate tool outputs before integration
        `.trim();

    return base_prompt;
  }

  async getAssistantPrompt(sessionContext: SessionContext): Promise<string> {
    const { types, schemas } = this.getFormattedSchemas();

    return `Respond by choosing from ${types} to generate output with corresponding format in ${schemas}`;
  }

  getMessageClassificationPrompt(message: string): string {
    const { types, schemas } = this.getFormattedSchemas();
    return `Please classify the following message according to its intent:
Message: ${message}

Available classifications:
${types}

Respond in JSON format with the message type and any relevant parameters according to the schema:
${schemas}`;
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
