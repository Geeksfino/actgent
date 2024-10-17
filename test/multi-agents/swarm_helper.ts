import { DefaultSchemaBuilder } from "@finogeeks/actgent";
import { deserializeMiniProgram } from "./utils";
import readline from "readline";

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

export type ClarificationNeededMessage = {
  messageType: typeof DefaultSchemaBuilder.CLARIFICATION_NEEDED;
  content: {
    questions: string[];
  };
};

export type ConfirmationNeededMessage = {
  messageType: typeof DefaultSchemaBuilder.CONFIRMATION_NEEDED;
  content: {
    prompt: string;
    options: string[];
  };
};

export type TaskCompleteMessage = {
  messageType: typeof DefaultSchemaBuilder.TASK_COMPLETE;
  content: {
    result: string;
  };
};

export type ErrorOrUnableMessage = {
  messageType: typeof DefaultSchemaBuilder.ERROR_OR_UNABLE;
  content: {
    reason: string;
    suggestedAction: string;
  };
};

export type CommandMessage = {
  messageType: typeof DefaultSchemaBuilder.COMMAND;
  content: {
    action: string;
    parameters: Record<string, string>;
  };
};

export type UserInputMessage = {
  messageType: "USER_INPUT";
  content: string;
};

export type AgentMessage =
  | ClarificationNeededMessage
  | ConfirmationNeededMessage
  | TaskCompleteMessage
  | ErrorOrUnableMessage
  | CommandMessage
  | UserInputMessage;

export interface MessageContext {
  originator: string;
  recipient: string;
  content: AgentMessage;
}

export async function getUserInput(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim());
    });
  });
}

export function logMessage(agents: Record<string, any>, originator: string, recipient: string, content: AgentMessage): void {
  const originatorName = getAgentName(agents, originator);
  const recipientName = getAgentName(agents, recipient);
  console.log(
    `Processing message from ${originatorName} to ${recipientName}: ${extractMessageContent(content)}`
  );
}

export function getAgentName(agents: Record<string, any>, taskType: string): string {
  if (taskType === "ORCHESTRATOR" || taskType === "USER") {
    return taskType;
  }
  const agent = agents[taskType];
  return agent ? agent.getName() : taskType;
}

export function extractMessageContent(message: AgentMessage): string {
  switch (message.messageType) {
    case DefaultSchemaBuilder.CLARIFICATION_NEEDED:
      return message.content.questions.join("\n");
    case DefaultSchemaBuilder.CONFIRMATION_NEEDED:
      return `${message.content.prompt}\nOptions:\n${message.content.options.join("\n")}`;
    case DefaultSchemaBuilder.TASK_COMPLETE:
      return message.content.result;
    case DefaultSchemaBuilder.ERROR_OR_UNABLE:
      return `${message.content.reason}\n${message.content.suggestedAction}`;
    case DefaultSchemaBuilder.COMMAND:
      return `Action: ${message.content.action}\nParameters: ${JSON.stringify(message.content.parameters)}`;
    case "USER_INPUT":
      return message.content;
    default:
      return JSON.stringify(message);
  }
}

export function isInteractionNeeded(response: AgentMessage): boolean {
  return [
    DefaultSchemaBuilder.CLARIFICATION_NEEDED,
    DefaultSchemaBuilder.CONFIRMATION_NEEDED,
    DefaultSchemaBuilder.ERROR_OR_UNABLE
  ].includes(response.messageType);
}

export function getPromptFromResponse(response: AgentMessage): string {
  switch (response.messageType) {
    case DefaultSchemaBuilder.CLARIFICATION_NEEDED:
      return response.content.questions.join("\n");
    case DefaultSchemaBuilder.CONFIRMATION_NEEDED:
      return `${response.content.prompt}\nOptions:\n${response.content.options.join("\n")}`;
    case DefaultSchemaBuilder.ERROR_OR_UNABLE:
      return `${response.content.reason}\n${response.content.suggestedAction}`;
    default:
      return "Invalid response type for prompt";
  }
}

export async function handleLowConfidence(taskType: string): Promise<string> {
  const confirmation = await getUserInput(
    `Low confidence classification. Proceed with ${taskType}? (yes/no): `
  );
  if (confirmation.toLowerCase() !== "yes") {
    return await getUserInput("Please rephrase your request: ");
  }
  return taskType;
}

export function handleDecisionMaking(task: any): ConfirmationNeededMessage {
  return {
    messageType: DefaultSchemaBuilder.CONFIRMATION_NEEDED,
    content: {
      prompt: task.result.prompt,
      options: task.result.options,
    },
  };
}

export function handleOtherTask(): ErrorOrUnableMessage {
  return {
    messageType: DefaultSchemaBuilder.ERROR_OR_UNABLE,
    content: {
      reason: "The topic is not clear. Please rephrase your request.",
      suggestedAction: "Please provide a clear and concise request.",
    },
  };
}

export async function handleFrontendDevelopmentComplete(response: AgentMessage, projectDir: string): Promise<void> {
  if (response.messageType === DefaultSchemaBuilder.TASK_COMPLETE) {
    console.log("agentResponse:", response.content.result);
    const val = JSON.parse(response.content.result);
    const generatedCode = val.generatedCode;
    console.log("generatedCode:", generatedCode);
    deserializeMiniProgram(JSON.stringify(generatedCode), projectDir);
    console.log("Project completed successfully!");
  } else {
    console.error("Unexpected message type for frontend development completion");
  }
}

export function createUserInputMessage(userInput: string): UserInputMessage {
  return {
    messageType: "USER_INPUT",
    content: userInput,
  };
}

export function createTaskCompleteMessage(response: AgentMessage): TaskCompleteMessage {
  if (response.messageType === DefaultSchemaBuilder.TASK_COMPLETE) {
    return {
      messageType: DefaultSchemaBuilder.TASK_COMPLETE,
      content: {
        result: JSON.stringify(response.content.result),
      },
    };
  } else {
    throw new Error("Unexpected message type for task completion");
  }
}
