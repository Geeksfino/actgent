import { IAgentPromptTemplate } from "../core/IPromptTemplate";
import { ClassificationTypeConfig } from "../core/IClassifier";

import { PromptManager } from "../core/PromptManager";
import { SessionContext } from "../core/SessionContext";
import { InferStrategy } from "../core/InferContext";
import { withTags } from '../core/Logger';
import { agentLoggers } from './logging';

export class MultiLevelPromptTemplate<T extends ReadonlyArray<ClassificationTypeConfig>> implements IAgentPromptTemplate {
  protected classificationTypes: T;
  private logger = agentLoggers.promptTemplate;

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

CRITICAL RESPONSE FORMAT REQUIREMENTS:  
1. ALWAYS respond with a valid JSON object.  
2. NEVER include any text or formatting outside the JSON object.  
3. Your entire response must be parseable as JSON.  

Required JSON structure:  
{
  "top_level_intent": "CONVERSATION" | "ACTION",
  "second_level_intent": "<intent_name>",  // Required if top_level_intent is ACTION
  "response": "<response_text>"            // Required if top_level_intent is CONVERSATION, may include markdown
}

Example valid responses:
// For conversation with markdown:
{
  "top_level_intent": "CONVERSATION",
  "second_level_intent": null,
  "response": "Here are some meditation benefits:\\n\\n* Reduces stress and anxiety\\n* Improves mental clarity\\n* Enhances emotional well-being"
}

// For ACTION:
{
  "top_level_intent": "ACTION",
  "second_level_intent": "offer_health_tips",
  "response": null
}

Remember: Any response not conforming to this exact JSON structure will be treated as invalid.  
`.trim();
  } 

  async getSystemPrompt(sessionContext: SessionContext): Promise<string> {
    const base_prompt = `
You are designated as: {role}
Your goal: {goal}
Your capabilities: {capabilities}
    `.trim();

    const msg = sessionContext.getLatestMessage();
    this.logger.debug(`getSystemPrompt with Current message: ${msg.payload.input}`,
      withTags(["multi-level"])
    );

    if (msg.metadata?.sender === "user") {
      return base_prompt + "\n" + this.topLevelPrompt();
    }
    else if (msg.metadata?.sender === "agent" && msg.metadata?.context?.routed) {
      try {
        const m = JSON.parse(msg.payload.input);
        this.logger.debug(`From assistant: Top-level intent is: ${msg.payload.input}`);
        if (m.data.top_level_intent === "ACTION") {
          const second_level_intent = m.data.second_level_intent;
          if (second_level_intent) {
            const instruction = sessionContext.getSession().core.getInstructionByName(second_level_intent);
            this.logger.debug(`Instruction found: ${JSON.stringify(instruction)} for ${second_level_intent}`,
              withTags(["multi-level"]));
            if (instruction) {
              this.logger.debug(`Instruction description: ${instruction.description}`);
              sessionContext.setCurrentInstruction(instruction);
              return base_prompt + "\n" + instruction.description;
            }
            else {
              this.logger.warning(`Instruction not found: ${second_level_intent}`,
                withTags(["multi-level"])
              );
              return base_prompt;
            }
          } else {
            // this should not happen
            this.logger.warning(`Second-level intent not found: ${m.data.second_level_intent}`,
              withTags(["multi-level"])
            );
            return base_prompt;
          }
        } else if (msg.metadata?.sender === "agent" && msg.metadata?.context?.exception){    
          const instruction = sessionContext.getCurrentInstruction();
          if (instruction) {
            this.logger.debug(`Instruction found: ${JSON.stringify(instruction)} for ${instruction.name}`,
              withTags(["multi-level"]));
            return base_prompt + "\n" + instruction.description;
          }
          return base_prompt;
        } else {
          return base_prompt;
        }
      } catch (error) {
        this.logger.warning(`[getSystemPrompt - routed] Failed to parse message payload: ${error}`,
          withTags(["multi-level"])
        );
        return base_prompt;
      }
    }
    else if (msg.metadata?.sender === "agent" && msg.metadata?.context?.tool_call) {
      try {
        const m = JSON.parse(msg.payload.input);
        this.logger.debug(`From agent: Top-level intent is: ${msg.payload.input}`,
          withTags(["multi-level"]));
        const instructionName = m.data.second_level_intent;
        this.logger.debug(`Instruction name found: ${instructionName}`,
          withTags(["multi-level"]));
        if (instructionName) {
          return base_prompt + "\n" + `[Agent] has executed ${instructionName} with results: ${msg.payload.input}`;
        }
        else {
          // this should not happen
          this.logger.warning(`Instruction not found: ${m.data.second_level_intent}`,
            withTags(["multi-level"])
          );
          return base_prompt;
        }
      } catch (error) {
        this.logger.warning(`[getSystemPrompt - tool_call] Failed to parse message payload: ${error}`,
          withTags(["multi-level"])
        );
        return base_prompt;
      }
    }
    else {  
      return base_prompt + "\n" + this.topLevelPrompt();
    }
  }

  async getAssistantPrompt(sessionContext: SessionContext): Promise<string> {
    const msg = sessionContext.getLatestMessage();
    this.logger.debug(`getAssistantPrompt with Current message: ${msg.payload.input}`);

    if (msg.metadata?.sender === "agent") {
      try {
        this.logger.warning(`From assistant:: Current message is: ${msg.payload.input}`);
        const m = JSON.parse(msg.payload.input);
        this.logger.debug(`From assistant: Top-level intent is: ${msg.payload.input}`);
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
                  this.logger.warn(`Failed to parse schema for ${instruction.name}: ${error}`,
                    withTags(["multi-level"])
                  );
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
              this.logger.warning(`Instruction not found: ${second_level_intent}. Assistant prompt set to empty.`,
                withTags(["multi-level"])
              );
              return "";
            }
          } else {
            // this should not happen
            this.logger.warning(`Second-level intent not found: ${m.data.second_level_intent}. Assistant prompt set to empty.`,
              withTags(["multi-level"])
            );
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
          this.logger.warning(`Top-level intent should be ACTION but found: ${m.data.top_level_intent}. Assistant prompt set to empty.`,
            withTags(["multi-level"])
          );
          return "";
        }
      } catch (error) {
        this.logger.warning(`[getAssistantPrompt] Failed to parse message payload: ${error}`,
          withTags(["multi-level"])
        );
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
      this.logger.warn(`extractDataFromLLMResponse failed to parse LLM response: ${error}`);
    }
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
