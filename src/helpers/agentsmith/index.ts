import { AgentSmith } from './AgentSmith';
import { LoggingConfig } from "../../core/interfaces";
import { ExecutionContext } from "../../core/ExecutionContext";
import readline from 'readline';
import path from "path";
import os from "os";
const loggerConfig: LoggingConfig = {
  destination: path.join(process.cwd(), `${AgentSmith.getName()}.log`)
};
// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

AgentSmith.registerStreamCallback((delta: string) => {
  console.log(delta);
});

const executionContext = AgentSmith.getExecutionContext();
executionContext.environment = {
  outputDirectory: path.join(process.cwd(), "smith-generated"),
  tempDirectory: path.join(os.tmpdir(), "smith-temp")
};
executionContext.addToolPreference("AgentGenerator", {
  agentName: ''  // Initialize with empty string
});
AgentSmith.run(loggerConfig);

async function chatLoop() {
  try {
    console.log("This is AgentSmith. I am a smith to help you create agents.");
    console.log("Type '/exit' to end the conversation.");

    let description = '';
    let agentName = '';

    // Get agent description
    do {
      description = await new Promise<string>((resolve) => {
        rl.question('What kind of agent do you want to create? ', resolve);
      });

      if (description.toLowerCase() === '/exit') {
        console.log("Thank you for using AgentSmith. Goodbye!");
        return;
      }

      if (description.trim() === '') {
        console.log("Please input something to continue.");
      }
    } while (description.trim() === '');

    // Get agent name
    do {
      agentName = await new Promise<string>((resolve) => {
        rl.question('What would you like to name this agent? ', resolve);
      });

      if (agentName.toLowerCase() === '/exit') {
        console.log("Thank you for using AgentSmith. Goodbye!");
        return;
      }

      if (agentName.trim() === '') {
        console.log("Please input a name for the agent.");
      }
    } while (agentName.trim() === '');
    executionContext.addToolPreference("AgentGenerator", {
      agentName: agentName  // Direct object without extra nesting
    });
    console.log(`Agent description: ${description}`);
    console.log(`Agent name: ${executionContext.toolPreferences.get("AgentGenerator")?.customOptions?.agentName}`);
    console.log(`Execution context: ${JSON.stringify(executionContext.toJSON(), null, 2)}`);

    const agentDescription = description + `\n\nThe name of this agent is ${agentName}.`;
    const session = await AgentSmith.createSession("user", agentDescription);

    while (true) {
      const userInput = await new Promise<string>((resolve) => {
        rl.question('You: ', resolve);
      });

      if (userInput.toLowerCase() === '/exit') {
        console.log("Thank you for using AgentSmith. Shutting down...");
        await AgentSmith.shutdown();
        break;
      }

      if (userInput.trim() === '') {
        continue;
      }

      await session.chat(userInput);
    }
  } catch (error) {
    console.error("An error occurred:", error);
  } finally {
    rl.close();
    process.exit(0);  // Ensure the process exits after shutdown
  }
}

chatLoop();
