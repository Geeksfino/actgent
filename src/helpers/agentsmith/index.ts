import { AgentSmith } from './AgentSmith';
import { LoggingConfig } from "../../core/interfaces";
import readline from 'readline';
import path from "path";

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
AgentSmith.run(loggerConfig);

async function chatLoop() {
  try {
    console.log("This is AgentSmith. I am a smith to help you create agents.");
    console.log("Type '/exit' to end the conversation.");

    let input = '';
    do {
      input = await new Promise<string>((resolve) => {
        rl.question('What agent do you want to create? ', resolve);
      });

      if (input.toLowerCase() === '/exit') {
        console.log("Thank you for using AgentSmith. Goodbye!");
        return;
      }

      if (input.trim() === '') {
        console.log("Please input something to continue.");
      }
    } while (input.trim() === '');

    const session = await AgentSmith.createSession("user", input);

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
