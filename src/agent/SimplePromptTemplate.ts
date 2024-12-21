import { IAgentPromptTemplate } from "../core/IPromptTemplate";
import { ClassificationTypeConfig } from "../core/IClassifier";
import { Memory } from "../core/Memory";
import { PromptManager } from "../core/PromptManager";
import { SessionContext } from "../core/SessionContext";
import { Message } from "../core/Message";

export interface Tool {
  name: string;
  description: string;
}

interface SchemaFormatting {
  types: string;
  schemas: string;
}

export class SimplePromptTemplate implements IAgentPromptTemplate {
  protected classificationTypes: ReadonlyArray<ClassificationTypeConfig>;

  constructor(classificationTypes: ReadonlyArray<ClassificationTypeConfig>) {
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

  async getSystemPrompt(sessionContext: SessionContext, memory: Memory): Promise<string> {
    const recentMessages = await memory.getRecentMessages();
    const systemContext = await memory.getSystemContext();

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

  async getAssistantPrompt(sessionContext: SessionContext, memory: Memory): Promise<string> {
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
    return "You are a helpful AI assistant. Please provide clear and concise responses.";
  }

  getClassificationTypes(): ReadonlyArray<ClassificationTypeConfig> {
    return this.classificationTypes;
  }

  extractFromLLMResponse(response: string): string {
    return response.trim();
  }

  async debugPrompt(
    promptManager: PromptManager,
    type: "system" | "assistant",
    sessionContext: SessionContext,
    memory: Memory
  ): Promise<string> {
    if (type === "system") {
      return this.getSystemPrompt(sessionContext, memory);
    }
    return this.getAssistantPrompt(sessionContext, memory);
  }
}
