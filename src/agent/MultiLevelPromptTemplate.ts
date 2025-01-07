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
    // Extract instruction names from classification types
    const instructionNames = this.classificationTypes
      .map(type => type.name)
      .filter(name => name !== 'CONVERSATION' && name !== 'ACTION')
      .join('\n- ');

    return `
Classify user query into one of these categories: CONVERSATION or ACTION. If the category is ACTION, also provide a second-level intent.

Categories:
CONVERSATION: General chit-chat, greetings, small talk, off-topic questions, expressions of thanks or appreciation. These do not require any specific action or tool invocation.
ACTION: Specific intents that require the agent to perform an action using a tool or service. This includes requests for information that require data retrieval.

Legitimate second-level intents include: 
- ${instructionNames}

Output format:
{
  "top_level_intent": "[Top-level intent: CONVERSATION or ACTION]",
  "second_level_intent": "[Second-level intent (if applicable)]",
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
    else if (msg.metadata?.sender === "agent" && msg.metadata?.context?.routed) {
      try {
        const m = JSON.parse(msg.payload.input);
        logger.debug(`From assistant: Top-level intent is: ${msg.payload.input}`);
        if (m.data.top_level_intent === "ACTION") {
          const second_level_intent = m.data.second_level_intent;
          if (second_level_intent) {
            const instruction = sessionContext.getSession().core.getInstructionByName(second_level_intent);
            logger.debug(`Instruction found: ${JSON.stringify(instruction)} for ${second_level_intent}`);
            if (instruction) {
              logger.debug(`Instruction description: ${instruction.description}`);
              sessionContext.setCurrentInstruction(instruction);
              return base_prompt + "\n" + instruction.description;
            }
            else {
              logger.warning(`Instruction not found: ${second_level_intent}`);
              return base_prompt;
            }
          } else {
            // this should not happen
            logger.warning(`Second-level intent not found: ${m.data.second_level_intent}`);
            return base_prompt;
          }
        } else if (msg.metadata?.sender === "agent" && msg.metadata?.context?.exception){    
          const instruction = sessionContext.getCurrentInstruction();
          if (instruction) {
            logger.debug(`Instruction found: ${JSON.stringify(instruction)} for ${instruction.name}`);
            return base_prompt + "\n" + instruction.description;
          }
          return base_prompt;
        } else {
          return base_prompt;
        }
      } catch (error) {
        logger.warning(`Failed to parse message payload: ${error}`);
        return base_prompt;
      }
    }
    else if (msg.metadata?.sender === "agent" && msg.metadata?.context?.tool_call) {
      try {
        const m = JSON.parse(msg.payload.input);
        logger.debug(`From agent: Top-level intent is: ${msg.payload.input}`);
        const instructionName = m.data.second_level_intent;
        logger.debug(`Instruction name found: ${instructionName}`);
        if (instructionName) {
          return base_prompt + "\n" + `[Agent] has executed ${instructionName} with results: ${msg.payload.input}`;
        }
        else {
          // this should not happen
          logger.warning(`Instruction not found: ${m.data.second_level_intent}`);
          return base_prompt;
        }
      } catch (error) {
        logger.warning(`Failed to parse message payload: ${error}`);
        return base_prompt;
      }
    }
    else {  
      return base_prompt + "\n" + this.topLevelPrompt();
    }
  }

  async getAssistantPrompt(sessionContext: SessionContext, memory: Memory): Promise<string> {
    const msg = sessionContext.getLatestMessage();
    if (msg.metadata?.sender === "agent") {
      try {
        const m = JSON.parse(msg.payload.input);
        logger.debug(`From assistant: Top-level intent is: ${msg.payload.input}`);
        if (m.data.top_level_intent === "ACTION") {
          const second_level_intent = m.data.second_level_intent;
          if (second_level_intent) {
            const instruction = sessionContext.getSession().core.getInstructionByName(second_level_intent);
            if (instruction) {
              let schema;
              if (instruction.schemaTemplate) {
                try {
                  schema = JSON.parse(instruction.schemaTemplate);
                } catch (error) {
                  console.warn(`Failed to parse schema for ${instruction.name}: ${error}`);
                }
              }
              else 
                schema = null;
              
              if (schema) {
                return "Respond in the following JSON format:\n" + 
                JSON.stringify({ messageType: instruction.name, data: schema }, null, 2) + "\n";
              }
              else {
                return "";
              }
            }
            else {
              // this should not happen
              logger.warning(`Instruction not found: ${second_level_intent}. Assistant prompt set to empty.`);
              return "";
            }
          } else {
            // this should not happen
            logger.warning(`Second-level intent not found: ${m.data.second_level_intent}. Assistant prompt set to empty.`);
            return "";
          }
        } else if (msg.metadata?.context?.exception) {
          const instruction = sessionContext.getCurrentInstruction();
          if (instruction) {
            return "Respond in the following JSON format:\n" + 
            JSON.stringify({ messageType: instruction.name, data: instruction.schemaTemplate }, null, 2) + "\n";
          }
          return "";
        }
        else {    
          // this should not happen 
          logger.warning(`Top-level intent should be ACTION but found: ${m.data.top_level_intent}. Assistant prompt set to empty.`);
          return "";
        }
      } catch (error) {
        logger.warning(`Failed to parse message payload: ${error}`);
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

  extractDataFromLLMResponse(response: string): string {
    try {
      const res = JSON.parse(response);
      if (res.top_level_intent === "CONVERSATION") {
        return res.response;
      } 
    } catch (error) {
      logger.warn(`extractDataFromLLMResponse failed to parse LLM response: ${error}`);
    }
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
