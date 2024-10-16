import {
  Session,
  LoggingConfig,
  DefaultSchemaBuilder,
} from "@finogeeks/actgent";
import fs from "fs";
import path from "path";
import readline from "readline";
import os from "os";
import { deserializeMiniProgram } from "./utils";
import { orchestratorAgent } from "./agents/OrchestratorAgent";
import { productManagerAgent } from "./agents/ProductManagerAgent";
import { specWriterAgent } from "./agents/SpecWriterAgent";
import { frontendDevAgent } from "./agents/FrontendDevAgent";

const agents = {
  REQUIREMENTS: orchestratorAgent,
  PRODUCT_MANAGEMENT: productManagerAgent,
  SPEC_WRITING: specWriterAgent,
  FRONTEND_DEVELOPMENT: frontendDevAgent,
  // Add other agents as needed
};

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Function to get user input
async function getUserInput(prompt: string): Promise<string> {
  while (true) {
    const answer = await new Promise<string>((resolve) => {
      rl.question(prompt, (answer) => {
        resolve(answer.trim());
      });
    });

    if (answer === "/exit") {
      console.log("Exiting the program.");
      process.exit(0);
    }

    if (answer !== "") {
      return answer;
    }

    // If the answer is empty, just print the prompt again
    process.stdout.write(">");
  }
}

// Function to expand tilde in path
function expandTilde(filePath: string): string {
  if (filePath[0] === "~") {
    return path.join(os.homedir(), filePath.slice(1));
  }
  return filePath;
}

// Define the message types
type ClarificationNeededMessage = {
  messageType: typeof DefaultSchemaBuilder.CLARIFICATION_NEEDED;
  content: {
    questions: string[];
  };
};

type ConfirmationNeededMessage = {
  messageType: typeof DefaultSchemaBuilder.CONFIRMATION_NEEDED;
  content: {
    prompt: string;
    options: string[];
  };
};

type TaskCompleteMessage = {
  messageType: typeof DefaultSchemaBuilder.TASK_COMPLETE;
  content: {
    result: string;
  };
};

type ErrorOrUnableMessage = {
  messageType: typeof DefaultSchemaBuilder.ERROR_OR_UNABLE;
  content: {
    reason: string;
    suggestedAction: string;
  };
};

type CommandMessage = {
  messageType: typeof DefaultSchemaBuilder.COMMAND;
  content: {
    action: string;
    parameters: Record<string, string>;
  };
};

type UserInputMessage = {
  messageType: "USER_INPUT";
  content: string;
};

type AgentMessage =
  | ClarificationNeededMessage
  | ConfirmationNeededMessage
  | TaskCompleteMessage
  | ErrorOrUnableMessage
  | CommandMessage
  | UserInputMessage;

interface MessageContext {
  originator: string;
  recipient: string;
  content: AgentMessage;
}

// Add this function to get the agent name
function getAgentName(taskType: string): string {
  if (taskType === "ORCHESTRATOR" || taskType === "USER") {
    return taskType;
  }
  const agent = agents[taskType];
  return agent ? agent.getName() : taskType;
}

function extractMessageContent(message: AgentMessage): string {
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

async function orchestrateWorkflow(
  desc: string,
  projectDir: string
): Promise<void> {
  console.log("Starting the software development process...");

  const sessions: { [key: string]: Session } = {};
  let orchestratorSession: Session;
  let messageQueue: MessageContext[] = [];

  function enqueueMessage(
    originator: string,
    recipient: string,
    content: AgentMessage
  ) {
    messageQueue.push({ originator, recipient, content });
  }

  async function processMessage(context: MessageContext): Promise<void> {
    const { originator, recipient, content } = context;
    const originatorName = getAgentName(originator);
    const recipientName = getAgentName(recipient);
    console.log(
      `Processing message from ${originatorName} to ${recipientName}: ${extractMessageContent(content)}`
    );

    if (recipient === "ORCHESTRATOR") {
      const messageContent = extractMessageContent(content);
      console.log("messageContent:", messageContent);
      if (!orchestratorSession) {
        orchestratorSession = await orchestratorAgent.createSession(
          "User",
          messageContent
        );
      } else {
        orchestratorSession.chat(messageContent);
      }

      const response = await new Promise<AgentMessage>((resolve) => {
        orchestratorSession.onEvent((data) => {
          resolve(data as AgentMessage);
        });
      });

      if (
        response.messageType === DefaultSchemaBuilder.CLARIFICATION_NEEDED ||
        response.messageType === DefaultSchemaBuilder.CONFIRMATION_NEEDED ||
        response.messageType === DefaultSchemaBuilder.ERROR_OR_UNABLE
      ) {
        let prompt: string;

        if (
          response.messageType === DefaultSchemaBuilder.CLARIFICATION_NEEDED
        ) {
          prompt = response.content.questions.join("\n");
        } else if (
          response.messageType === DefaultSchemaBuilder.CONFIRMATION_NEEDED
        ) {
          prompt = `${response.content.prompt}\nOptions:\n${response.content.options.join("\n")}`;
        } else {
          prompt = `${response.content.reason}\n${response.content.suggestedAction}`;
        }

        if (originator === "USER") {
          const userInput = await getUserInput(prompt + "\n\nYour response: ");
          enqueueMessage("USER", "ORCHESTRATOR", {
            messageType: "USER_INPUT",
            content: userInput,
          });
        } else {
          const userInput = await getUserInput(prompt + "\n\nYour response: ");
          enqueueMessage("ORCHESTRATOR", originator, {
            messageType: "USER_INPUT",
            content: userInput,
          });
        }
        return;
      }

      if (response.messageType === DefaultSchemaBuilder.COMMAND) {
        console.log("command===>:", response.content);
        return;
      }

      // The orchestrator agent has classified the task and the confidence level
      const task = JSON.parse(extractMessageContent(response));
      const { taskType, confidence } = task;

      if (confidence < 70 && originator === "USER") {
        const confirmation = await getUserInput(
          `Low confidence classification. Proceed with ${taskType}? (yes/no): `
        );
        if (confirmation.toLowerCase() !== "yes") {
          const newInput = await getUserInput("Please rephrase your request: ");
          enqueueMessage("USER", "ORCHESTRATOR", {
            messageType: "USER_INPUT",
            content: newInput,
          });
          return;
        }
      }

      if (taskType == "DECISION_MAKING") {
        const decisionMakingMessage: ConfirmationNeededMessage = {
          messageType: DefaultSchemaBuilder.CONFIRMATION_NEEDED,
          content: {
            prompt: task.result.prompt  ,
            options: task.result.options,
          },
        };
        enqueueMessage("ORCHESTRATOR", "USER", decisionMakingMessage);
        return;
      }

      if (taskType == "OTHER") {
        const otherMessage: ErrorOrUnableMessage = {
          messageType: DefaultSchemaBuilder.ERROR_OR_UNABLE,
          content: {
            reason: "The topic is not clear. Please rephrase your request.",
            suggestedAction: "Please provide a clear and concise request.",
          },
        };
        enqueueMessage("ORCHESTRATOR", "USER", otherMessage);
        return;
      }

      // The task is classified and can be handled by the target agent and the confidence level is high enough to proceed
      const targetAgent = agents[taskType];
      if (!targetAgent) {
        console.log(`No agent available for ${taskType}. Skipping.`);
        if (originator === "USER") {
          const newInput = await getUserInput(
            "Please provide the next instruction: "
          );
          enqueueMessage("USER", "ORCHESTRATOR", {
            messageType: "USER_INPUT",
            content: newInput,
          });
        }
        return;
      }

      console.log(
        `Enqueueing message from ORCHESTRATOR to ${getAgentName(taskType)}`
      );
      enqueueMessage("ORCHESTRATOR", taskType, content);

    } else if (recipient === "USER") {
      let userInput: string;
      if (content.messageType === DefaultSchemaBuilder.CLARIFICATION_NEEDED) {
        userInput = await getUserInput(
          `Clarification needed:\n${content.content.questions.join("\n")}\n\nYour response: `
        );
      } else if (
        content.messageType === DefaultSchemaBuilder.CONFIRMATION_NEEDED
      ) {
        userInput = await getUserInput(
          `Confirmation needed:\n${content.content.prompt}\nOptions:\n${content.content.options.join("\n")}\n\nYour response: `
        );
      } else if (content.messageType === DefaultSchemaBuilder.ERROR_OR_UNABLE) {
        userInput = await getUserInput(
          `Error: ${content.content.reason}\n${content.content.suggestedAction}\n\nPlease provide new instructions: `
        );
      } else {
        userInput = await getUserInput(
          `Message from ${originator}: ${JSON.stringify(content)}\n\nYour response: `
        );
      }
      enqueueMessage("USER", "ORCHESTRATOR", {
        messageType: "USER_INPUT",
        content: userInput,
      });
    } else {
      // Message is for a specific agent
      const messageContent = extractMessageContent(content);

      if (!sessions[recipient]) {
        sessions[recipient] = await agents[recipient].createSession(
          "Orchestrator",
          messageContent
        );
      } else {
        sessions[recipient].chat(messageContent);
      }

      const agentResponse = await new Promise<AgentMessage>((resolve) => {
        sessions[recipient].onEvent((data) => {
          resolve(data as AgentMessage);
        });
      });

      if (agentResponse.messageType === DefaultSchemaBuilder.TASK_COMPLETE) {

        if (recipient === "FRONTEND_DEVELOPMENT") {  
          console.log("agentResponse:", agentResponse.content.result);
          const val = JSON.parse(agentResponse.content.result);
          const generatedCode = val.generatedCode;
          console.log("generatedCode:", generatedCode);
          deserializeMiniProgram(JSON.stringify(generatedCode), projectDir);
          console.log("Project completed successfully!");
          return;
        }

        const agentName = getAgentName(recipient);
        const originatorName = getAgentName(originator);
        console.log(`Enqueueing message from agent ${agentName} to ${originatorName}`);

        const taskCompleteMessage: TaskCompleteMessage = {
          messageType: DefaultSchemaBuilder.TASK_COMPLETE,
          content: {
            result: JSON.stringify(agentResponse.content.result),
          },
        };
        enqueueMessage(recipient, originator, taskCompleteMessage);
      } else if (agentResponse.messageType === DefaultSchemaBuilder.ERROR_OR_UNABLE) {
        const errorOrUnableMessage: ErrorOrUnableMessage = {
          messageType: DefaultSchemaBuilder.ERROR_OR_UNABLE,
          content: {
            reason: agentResponse.content.reason,
            suggestedAction: agentResponse.content.suggestedAction,
          },
        };
        enqueueMessage(recipient, originator, errorOrUnableMessage);
      } else if (agentResponse.messageType === DefaultSchemaBuilder.CLARIFICATION_NEEDED) {
        const clarificationNeededMessage: ClarificationNeededMessage = {    
          messageType: DefaultSchemaBuilder.CLARIFICATION_NEEDED,
          content: {
            questions: agentResponse.content.questions,
          },
        };
        enqueueMessage(recipient, originator, clarificationNeededMessage);
      } else if (agentResponse.messageType === DefaultSchemaBuilder.CONFIRMATION_NEEDED) {
        const confirmationNeededMessage: ConfirmationNeededMessage = {
          messageType: DefaultSchemaBuilder.CONFIRMATION_NEEDED,
          content: {
            prompt: agentResponse.content.prompt,
            options: agentResponse.content.options,
          },
        };
        enqueueMessage(recipient, originator, confirmationNeededMessage);
      }
    }
  }

  // Initial message
  enqueueMessage("USER", "ORCHESTRATOR", {
    messageType: "USER_INPUT",
    content: desc,
  });

  while (messageQueue.length > 0) {
    const message = messageQueue.shift()!;
    await processMessage(message);
  }
}

// Main program
async function main() {
  if (process.argv.length < 4) {
    console.error(
      "Usage: bun run test/multi-agents/swarm.js <workarea_directory> <project_name>"
    );
    console.error(
      "Example: bun run test/multi-agents/swarm.js ~/workarea myproject"
    );
    process.exit(1);
  }

  const baseDir = process.cwd();
  const workareaDir = expandTilde(process.argv[2]);
  const projectName = process.argv[3];
  const projectDir = path.join(workareaDir, projectName);
  // Ensure workarea directory exists
  if (!fs.existsSync(projectDir)) {
    console.log(`Creating project directory: ${projectDir}`);
    fs.mkdirSync(projectDir, { recursive: true });
  }

  console.log("Starting the software development process...");

  // Run all agents
  const agents = [
    orchestratorAgent,
    specWriterAgent,
    productManagerAgent,
    frontendDevAgent,
  ];

  for (const agent of agents) {
    const logFile = path.join(workareaDir, `${agent.getName()}.log`);

    // Create a loggingConfig for each agent
    const loggingConfig: LoggingConfig = {
      destination: logFile,
    };

    // Pass the loggingConfig to the agent's run method
    await agent.run(loggingConfig);

    agent.registerStreamCallback((delta: string) => {
      console.log(`${agent.getName()}:`, delta);
    });
  }

  try {
    const desc = await getUserInput("Please enter the project description: ");
    await orchestrateWorkflow(desc, projectDir);
    console.log("Project completed successfully!");
  } catch (error) {
    console.error("An error occurred during the development process:", error);
  } finally {
    rl.close();
    process.exit(0);
  }
}

// Run the main program
main().catch((error) => {
  console.error("An unhandled error occurred:", error);
  process.exit(1);
});
