import {
  Session,
  LoggingConfig,
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
  let orchestratorSession = await orchestratorAgent.createSession("User", currentInput);

  while (true) {
    console.log("Current input:", currentInput);
    const result = await new Promise<any>((resolve) => {
      orchestratorSession.onEvent((data) => {
        if (data.messageType === "TASK_CLASSIFICATION") {
          resolve(data.classification);
        } else if (data.messageType === "CLARIFICATION_NEEDED") {
          resolve({ questions: data.questions });
        }
      });
      //orchestratorSession.chat(currentInput);
    });
    console.log("orchestration:", JSON.stringify(result, null, 2));

    if (result.questions) {
      const clarification = await getUserInput(
        "Clarification needed:\n" + result.questions.join("\n") + "\n\nYour response: "
      );
      currentInput = clarification;
      continue;
    }

    const { taskType, confidence, reason } = result;
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
    const agentResult = await new Promise<any>((resolve) => {
      agentSession.onEvent((data) => {
        if (data.messageType === "CLARIFICATION_NEEDED") {
          promptForClarification(data.questions, agentSession, orchestratorSession).then(resolve);
        } else {
          resolve(data);
        }
      });
    });

    console.log(`${taskType} result:`, JSON.stringify(agentResult, null, 2));

    if (taskType === "FRONTEND_DEVELOPMENT") {
      deserializeMiniProgram(JSON.stringify(agentResult.generatedCode), projectDir);
      break;
    }

    orchestratorSession.chat(`Task completed by ${taskType}. Result: ${JSON.stringify(agentResult)}. What is the next step?`); 
  }
}

async function promptForClarification(
  questions: string[],
  agentSession: Session,
  orchestratorSession: Session
): Promise<any> {
  const orchestratorResponse = await new Promise<any>((resolve) => {
    orchestratorSession.onEvent((data) => {
      if (data.messageType === "TASK_CLASSIFICATION") {
        resolve(data.classification);
      } else if (data.messageType === "CLARIFICATION_NEEDED") {
        resolve({ questions: data.questions });
      }
    });
    orchestratorSession.chat(`Agent needs clarification: ${JSON.stringify(questions)}`);
  });

  if (orchestratorResponse.taskType === "USER") {
    const answer = await getUserInput(
      "Please provide clarification for the following questions:\n" +
      questions.join("\n") +
      "\n\n>"
    );
    return new Promise<any>((resolve) => {
      agentSession.onEvent((data) => {
        if (data.messageType === "PRODUCT_MANAGEMENT" || data.messageType === "SPEC_WRITING" || data.messageType === "FRONTEND_DEVELOPMENT") {
          resolve(data);
        } else if (data.messageType === "CLARIFICATION_NEEDED") {
          promptForClarification(data.questions, agentSession, orchestratorSession).then(resolve);
        }
      });
      agentSession.chat(answer);
    });
  } else {
    // Let the orchestrator handle the clarification with another agent
    return orchestratorResponse;
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
