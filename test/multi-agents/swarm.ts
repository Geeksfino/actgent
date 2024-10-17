import {
  Session,
  LoggingConfig,
  DefaultSchemaBuilder,
} from "@finogeeks/actgent";
import fs from "fs";
import path from "path";
import os from "os";
import { orchestratorAgent } from "./agents/OrchestratorAgent";
import { productManagerAgent } from "./agents/ProductManagerAgent";
import { specWriterAgent } from "./agents/SpecWriterAgent";
import { frontendDevAgent } from "./agents/FrontendDevAgent";
import {
  MessageContext,
  ConversationContext,
  AgentMessage,
  ContextAwareMessage,
} from "./ConversationContext";
import {
  getUserInput,
  logMessage,
  extractMessageContent,
  isInteractionNeeded,
  getPromptFromResponse,
  handleLowConfidence,
  handleDecisionMaking,
  handleOtherTask,
  handleFrontendDevelopmentComplete,
  createUserInputMessage,
  createTaskCompleteMessage,
} from "./swarm_helper";

const agents = {
  REQUIREMENTS: productManagerAgent,
  PRODUCT_MANAGEMENT: productManagerAgent,
  SPEC_WRITING: specWriterAgent,
  FRONTEND_DEVELOPMENT: frontendDevAgent,
};

// Function to expand tilde in path
function expandTilde(filePath: string): string {
  if (filePath[0] === "~") {
    return path.join(os.homedir(), filePath.slice(1));
  }
  return filePath;
}

// Modify the createContextAwareMessage function
function createContextAwareMessage(
  originator: string,
  recipient: string,
  content: AgentMessage,
  context: ConversationContext
): ContextAwareMessage {
  const recentMessages = context.getRecentContext(3); // Get last 5 messages

  let conversationContext = "Conversation context:\n\n";
  for (const msg of recentMessages) {
    conversationContext += `[${msg.originator} to ${msg.recipient}]: ${extractMessageContent(msg.content)}\n`;
  }

  // Add the current message to the context
  conversationContext += `[${originator} to ${recipient}]: ${extractMessageContent(content)}`;

  return {
    messageType: "CONTEXT_AWARE",
    content: conversationContext,
  };
}

type WorkflowContext = {
  sessions: { [key: string]: Session };
  orchestratorSession: Session | null;
  messageQueue: MessageContext[];
  projectDir: string;
  conversationContext: ConversationContext;
  enqueueMessage: (
    originator: string,
    recipient: string,
    content: AgentMessage
  ) => void;
};

async function processOrchestratorMessage(
  context: WorkflowContext,
  messageContext: MessageContext
): Promise<void> {
  const { originator, content } = messageContext;
  const messageContent = extractMessageContent(content);

  if (!context.orchestratorSession) {
    context.orchestratorSession = await orchestratorAgent.createSession(
      "User",
      messageContent
    );
  } else {
    context.orchestratorSession.chat(messageContent);
  }

  const response = await new Promise<AgentMessage>((resolve) => {
    context.orchestratorSession!.onEvent((data) =>
      resolve(data as AgentMessage)
    );
  });

  await handleOrchestratorResponse(context, response, originator);
}

async function handleOrchestratorResponse(
  context: WorkflowContext,
  msg: AgentMessage,
  originator: string
): Promise<void> {
  if (isInteractionNeeded(msg)) {
    await handleUserInteraction(context, msg, originator);
  } else if (msg.messageType === DefaultSchemaBuilder.COMMAND) {
    console.log("Command received:", msg.content);
  } else {
    await handleTaskClassification(context, msg, originator);
  }
}

async function handleUserInteraction(
  context: WorkflowContext,
  response: AgentMessage,
  originator: string
): Promise<void> {
  const prompt = getPromptFromResponse(response);
  const userInput = await getUserInput(prompt + "\n\nYour response: ");
  context.enqueueMessage(
    originator === "USER" ? "USER" : "ORCHESTRATOR",
    "ORCHESTRATOR",
    createUserInputMessage(userInput)
  );
}

async function handleTaskClassification(
  context: WorkflowContext,
  msg: AgentMessage,
  originator: string
): Promise<void> {
  const task = JSON.parse(extractMessageContent(msg));
  const { taskType, confidence } = task;

  if (confidence < 70 && originator === "USER") {
    const result = await handleLowConfidence(taskType);
    if (typeof result === "string" && result !== taskType) {
      context.enqueueMessage(
        "USER",
        "ORCHESTRATOR",
        createUserInputMessage(result)
      );
      return;
    }
  }

  // if the incoming message is from an agent and orchestrator determines that it needs to make a decision from user,
  // then orchestrator will send it to USER with decision or confirmation. Note this is not covered in DefaultSchemaBuilder.
  // So it needs to be handled here.
  if (taskType === "DECISION_MAKING") {
    context.enqueueMessage("ORCHESTRATOR", "USER", handleDecisionMaking(task));
  } else if (taskType === "OTHER") {
    context.enqueueMessage("ORCHESTRATOR", "USER", handleOtherTask());
  } else {
    const targetAgent = agents[taskType];
    if (targetAgent) {
      context.enqueueMessage("ORCHESTRATOR", taskType, msg);
    } else {
      const newInput = await getUserInput(
        "No agent available for this task type. Please provide the next instruction: "
      );
      context.enqueueMessage(
        "USER",
        "ORCHESTRATOR",
        createUserInputMessage(newInput)
      );
    }
  }
}

async function processAgentMessage(
  context: WorkflowContext,
  messageContext: MessageContext
): Promise<void> {
  const { originator, recipient, content } = messageContext;
  const messageContent = extractMessageContent(content);

  if (!context.sessions[recipient]) {
    context.sessions[recipient] = await agents[recipient].createSession(
      "Orchestrator",
      messageContent
    );
  } else {
    context.sessions[recipient].chat(messageContent);
  }

  const agentResponse = await new Promise<AgentMessage>((resolve) => {
    context.sessions[recipient].onEvent((data) =>
      resolve(data as AgentMessage)
    );
  });

  await handleAgentResponse(context, agentResponse, recipient, originator);
}

async function handleAgentResponse(
  context: WorkflowContext,
  response: AgentMessage,
  recipient: string,
  originator: string
): Promise<void> {
  if (response.messageType === DefaultSchemaBuilder.TASK_COMPLETE) {
    if (recipient === "FRONTEND_DEVELOPMENT") {
      await handleFrontendDevelopmentComplete(response, context.projectDir);
    } else {
      context.enqueueMessage(
        recipient,
        originator,
        createTaskCompleteMessage(response)
      );
    }
  } else {
    context.enqueueMessage(recipient, originator, response);
  }
}

function createErrorMessage(error: Error): AgentMessage {
  return {
    messageType: DefaultSchemaBuilder.ERROR_OR_UNABLE,
    content: {
      reason: error.message,
      suggestedAction: "Please try again or provide a different instruction.",
    },
  };
}

async function orchestrateWorkflow(
  desc: string,
  projectDir: string
): Promise<void> {
  console.log("Starting the software development process...");

  const context: WorkflowContext = {
    sessions: {},
    orchestratorSession: null,
    messageQueue: [],
    projectDir,
    conversationContext: new ConversationContext(),
    enqueueMessage: (originator, recipient, content) => {
      let msg: AgentMessage;
      if (recipient === "ORCHESTRATOR") {
        msg = content;
      } else {
        msg = createContextAwareMessage(
          originator,
          recipient,
          content,
          context.conversationContext
        );
      }

      context.messageQueue.push({ originator, recipient, content: msg });
      context.conversationContext.addEntry(originator, recipient, content);
    },
  };

  // Initial message
  context.enqueueMessage("USER", "ORCHESTRATOR", createUserInputMessage(desc));

  while (context.messageQueue.length > 0) {
    const message = context.messageQueue.shift()!;
    console.log(JSON.stringify(message, null, 2));

    try {
      if (message.recipient === "ORCHESTRATOR") {
        console.log("====Orchestrator message received====");
        await processOrchestratorMessage(context, message);
      } else if (message.recipient === "USER") {
        const userInput = await getUserInput(
          `Message from ${message.originator}: ${extractMessageContent(message.content)}\n\nYour response: `
        );
        context.enqueueMessage(
          "USER",
          "ORCHESTRATOR",
          createUserInputMessage(userInput)
        );
      } else {
        console.log("====Agent message received====");
        await processAgentMessage(context, message);
      }
    } catch (error) {
      console.error(`Error processing message: ${error.message}`);
      context.enqueueMessage(
        message.recipient,
        message.originator,
        createErrorMessage(error)
      );
    }
  }

  console.log("Workflow completed.");
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
      //console.log(`${agent.getName()}:`, delta);
    });
  }

  try {
    const desc = await getUserInput("Please enter the project description: ");
    await orchestrateWorkflow(desc, projectDir);
    console.log("Project completed successfully!");
  } catch (error) {
    console.error("An error occurred during the development process:", error);
  } finally {
    process.exit(0);
  }
}

// Run the main program
main().catch((error) => {
  console.error("An unhandled error occurred:", error);
  process.exit(1);
});
