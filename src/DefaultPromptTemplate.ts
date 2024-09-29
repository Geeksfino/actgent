import { AgentPromptTemplate, LLMClassificationType, LLMClassification } from './AgentPromptTemplate';

export class DefaultPromptTemplate implements AgentPromptTemplate {
    getSystemPrompt(): string {
        return `
          You are an AI agent with the goal of \"{goal}\". 
          Your objective is to align every action with this overarching mission while processing specific tasks efficiently and effectively.
          Keep this goal in mind for every task you undertake."
        `;
    }

    getAssistantPrompt(): string {
        return "Assistant: ";
    }

    getMessageClassificationPrompt(message: string): string {
      const prompt = `
      # Message Analysis Prompt
      
      Analyze the following message comprehensively. Categorize the message into one of these types:
      - SIMPLE_QUERY: A straightforward question that can be answered directly.
      - COMPLEX_TASK: A task that requires multiple steps or extended processing.
      - CLARIFICATION_NEEDED: The message is unclear or lacks necessary information.
      - COMMAND: An instruction or order for the agent to perform a specific action.
      
      Based on the message type, provide a response in one of the following JSON formats:
      
      1. For SIMPLE_QUERY:
      \`\`\`json
      {
        "messageType": "SIMPLE_QUERY",
        "answer": "<DIRECT_ANSWER_TO_QUERY>"
      }
      \`\`\`
      
      2. For COMPLEX_TASK:
      \`\`\`json
      {
        "messageType": "COMPLEX_TASK",
        "actionPlan": {
          "task": "<MAIN_OBJECTIVE>",
          "subtasks": [
            "<SUBTASK_1>",
            "<SUBTASK_2>",
            "..."
          ]
        }
      }
      \`\`\`
      
      3. For CLARIFICATION_NEEDED:
      \`\`\`json
      {
        "messageType": "CLARIFICATION_NEEDED",
        "questions": [
          "<QUESTION_1>",
          "<QUESTION_2>",
          "..."
        ]
      }
      \`\`\`
      
      4. For COMMAND:
      \`\`\`json
      {
        "messageType": "COMMAND",
        "command": {
          "action": "<SPECIFIC_ACTION>",
          "parameters": {
            "<PARAM_1>": "<VALUE_1>",
            "<PARAM_2>": "<VALUE_2>",
            "..."
          },
          "expectedOutcome": "<DESCRIPTION_OF_EXPECTED_RESULT>"
        }
      }
      \`\`\`
      
      Ensure that your response strictly adheres to these formats based on the identified message type. Provide concise yet comprehensive information within the constraints of each format.
      
      Analyze the following message:
      
      ${message}
      `;

      return prompt.trim();
    }
} 
