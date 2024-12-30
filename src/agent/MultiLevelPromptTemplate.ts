import { IAgentPromptTemplate } from "../core/IPromptTemplate";
import { ClassificationTypeConfig } from "../core/IClassifier";
import { Memory } from "../core/Memory";
import { PromptManager } from "../core/PromptManager";
import { SessionContext } from "../core/SessionContext";
import { InferStrategy } from "../core/InferContext";
import { logger } from '../core/Logger';

export class MultiLevelPromptTemplate<T extends ReadonlyArray<ClassificationTypeConfig>> implements IAgentPromptTemplate {
  protected classificationTypes: T;

  constructor(classificationTypes: T, _strategy?: InferStrategy) {
    this.classificationTypes = classificationTypes;
  }

  private topLevelPrompt(): string {
    return `
Classify user query into one of these categories: CONVERSATION or ACTION. If the category is ACTION, also provide a second-level intent in the format "ACTION:OBJECT".

Categories:
CONVERSATION: General chit-chat, greetings, small talk, off-topic questions, expressions of thanks or appreciation. These do not require any specific action or tool invocation.
ACTION: Requests that require the agent to perform an action using a tool or service. This includes requests for information that require data retrieval.

Output format:
{
  "top_level_intent": "[Top-level intent: CONVERSATION or ACTION]",
  "second_level_intent": "[Second-level intent (if applicable), in ACTION:OBJECT format]",
  "response": "[A natural language response if top_level_intent is CONVERSATION]"
}

If the top_level_intent is CONVERSATION, generate a relevant and engaging natural language response in the "response" field. If the top_level_intent is ACTION, leave the "response" field empty or set it to null.
    `.trim();
  } 

  async getSystemPrompt(sessionContext: SessionContext, memory: Memory): Promise<string> {
    const base_prompt = `
You are designated as: {role}
Your goal: {goal}
Your capabilities: {capabilities}
    `.trim();

    const msg = sessionContext.getLatestMessage();
    if (msg.metadata?.sender === "user") {
      return base_prompt + "\n" + this.topLevelPrompt();
    }
    else if (msg.metadata?.sender === "assistant") {
      const data = JSON.parse(msg.payload.input);
      if (data.top_level_intent === "ACTION") {
        const second_level_intent = data.second_level_intent;
        if (second_level_intent) {
          const instruction = sessionContext.getSession().core.getInstructionByName(second_level_intent);
          if (instruction) {
            return base_prompt + "\n" + instruction.description;
          }
          else {
            // this should not happen
            logger.warning(`Instruction not found: ${second_level_intent}`);
            return base_prompt;
          }
        } else {
          // this should not happen
          logger.warning(`Second-level intent not found: ${data.second_level_intent}`);
          return base_prompt;
        }
      } else {    
        // this should not happen 
        logger.warning(`Top-level intent should be ACTION but found: ${data.top_level_intent}`);
        return base_prompt;
      }
    }
    else if (msg.metadata?.sender === "agent") {
      const data = JSON.parse(msg.payload.input);
      const instructionName = data.instructionName;
      if (instructionName) {
        return base_prompt + "\n" + `[Agent] has executed ${instructionName} with results: ${msg.payload.input}`;
      }
      else {
        // this should not happen
        logger.warning(`Instruction not found: ${data.instruction}`);
        return base_prompt;
      }
    }
    else {  
      return base_prompt + "\n" + this.topLevelPrompt();
    }
  }

  async getAssistantPrompt(sessionContext: SessionContext, memory: Memory): Promise<string> {
    const msg = sessionContext.getLatestMessage();
    if (msg.metadata?.sender === "assistant") {
      const data = JSON.parse(msg.payload.input);
      if (data.top_level_intent === "ACTION") {
        const second_level_intent = data.second_level_intent;
        if (second_level_intent) {
          const instruction = sessionContext.getSession().core.getInstructionByName(second_level_intent);
          if (instruction) {
            return instruction.schemaTemplate || "";
          }
          else {
            // this should not happen
            logger.warning(`Instruction not found: ${second_level_intent}. Assistant prompt set to empty.`);
            return "";
          }
        } else {
          // this should not happen
          logger.warning(`Second-level intent not found: ${data.second_level_intent}. Assistant prompt set to empty.`);
          return "";
        }
      } else {    
        // this should not happen 
        logger.warning(`Top-level intent should be ACTION but found: ${data.top_level_intent}. Assistant prompt set to empty.`);
        return "";
      }
    }
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

  extractFromLLMResponse(response: string): string {
    return response;
  }

  async debugPrompt(
    promptManager: PromptManager,
    type: "system" | "assistant",
    sessionContext: SessionContext,
    memory: Memory
  ): Promise<string> {
    const prompt = type === "system" 
      ? await promptManager.getSystemPrompt(sessionContext, memory) 
      : await promptManager.getAssistantPrompt(sessionContext, memory);
    return prompt;
  }
}
