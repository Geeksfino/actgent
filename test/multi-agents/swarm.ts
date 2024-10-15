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
import { orchestratorAgent } from './agents/OrchestratorAgent';
import { productManagerAgent } from './agents/ProductManagerAgent';
import { specWriterAgent } from "./agents/SpecWriterAgent";
import { frontendDevAgent } from './agents/FrontendDevAgent';

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

    if (answer === '/exit') {
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

async function orchestrateWorkflow(desc: string, projectDir: string): Promise<void> {
  console.log("Starting the software development process...");

  const sessions: { [key: string]: Session } = {};
  let currentInput = desc;
  let orchestratorSession;

  while (true) {
    console.log("Current input:", currentInput);
    if (!orchestratorSession) {
      orchestratorSession = await orchestratorAgent.createSession("User", currentInput);
    } else {
      orchestratorSession.chat(currentInput);
    }
    const res = await new Promise<any>((resolve) => {
      orchestratorSession.onEvent((data) => {
        resolve(JSON.stringify(data));
      });
    });
    const response = JSON.parse(res);
    console.log("orchestration:", response);
    const content = response.content;
    console.log("content:", content);

    if (response.messageType === DefaultSchemaBuilder.CLARIFICATION_NEEDED) {
      const clarification = await getUserInput(
        "Clarification needed:\n" + content.questions.join("\n") + "\n\nYour response: "
      );
      currentInput = clarification;
      continue;
    }

    if (response.messageType === DefaultSchemaBuilder.CONFIRMATION_NEEDED) {
      const confirmation = await getUserInput(
        "Confirmation needed:\n" + content.prompt + "\nOptions:\n" + content.options.join("\n") + "\n\nYour response: "
      );
      currentInput = confirmation;
      continue;
    }

    if (response.messageType === DefaultSchemaBuilder.ERROR_OR_UNABLE) {
      currentInput = await getUserInput(
        "Error or unable to process your request: " + content.reason + "\n" + content.suggestedAction +  "\n\nPlease rephrase your request: "
      );
      continue;
    }

    if (response.messageType === DefaultSchemaBuilder.COMMAND) {
      console.log("command:", content.command);
      continue;
    }

    const task = JSON.parse(content.result);
    console.log("taskType:", task.taskType);
    console.log("confidence:", task.confidence);
    console.log("reason:", task.reason);
    const { taskType, confidence, reason } = task;
    console.log(`Classified as ${taskType} (Confidence: ${confidence}%)`);
    console.log(`Reason: ${reason}`);

    if (confidence < 70) {
      const confirmation = await getUserInput(
        `Low confidence classification. Proceed with ${taskType}? (yes/no): `
      );
      if (confirmation.toLowerCase() !== 'yes') {
        currentInput = await getUserInput("Please rephrase your request: ");
        continue;
      }
    }

    const targetAgent = agents[taskType];
    if (!targetAgent) {
      console.log(`No agent available for ${taskType}. Skipping.`);
      currentInput = await getUserInput("Please provide the next instruction: ");
      continue;
    }

    if (!sessions[taskType]) {
      sessions[taskType] = await targetAgent.createSession("Orchestrator", currentInput);
    }

    const agentSession = sessions[taskType];
    agentSession.chat(currentInput);
    const agentResult = await new Promise<any>((resolve) => {
      agentSession.onEvent((data) => {
        resolve(JSON.stringify(data));
      });
    });

    const r = JSON.parse(agentResult);
    console.log(`=====${taskType} result======`, r);
    console.log(`=====${taskType} result======`, r.messageType);
    if (taskType === "FRONTEND_DEVELOPMENT" && r.messageType === DefaultSchemaBuilder.TASK_COMPLETE) {
        const val = JSON.parse(r.content.result);
        const generatedCode = val.generatedCode;
        console.log("generatedCode:", generatedCode);
        deserializeMiniProgram(JSON.stringify(generatedCode), projectDir);
      break;
    }

    if (r.messageType === DefaultSchemaBuilder.CLARIFICATION_NEEDED ||
        r.messageType === DefaultSchemaBuilder.CONFIRMATION_NEEDED ||
        r.messageType === DefaultSchemaBuilder.ERROR_OR_UNABLE) {
      // Relay the agent's request back to the orchestrator
      currentInput = `Agent ${taskType} needs assistance: ${r}`;
      orchestratorSession.chat(currentInput);
      continue;
    }

    currentInput = `Task completed by ${taskType}. Result: ${r}. What is the next step?`;

    // At the end of the loop, we need to send the next message
    if (currentInput !== desc) {  // Skip for the first iteration
      orchestratorSession.chat(currentInput);
    }
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
      console.log(`${agent.getName()} output:`, delta);
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
