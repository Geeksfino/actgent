import { TravelAgent } from './TavelAgent';
import readline from 'readline';

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

TravelAgent.registerStreamCallback((delta: string) => {
  console.log(delta);
});
TravelAgent.run();

async function chatLoop() {
  try {
    console.log("Welcome to the Travel Agency!");
    console.log("Type '/exit' to end the conversation.");

    let input = '';
    do {
      input = await new Promise<string>((resolve) => {
        rl.question('How may I help you today? ', resolve);
      });

      if (input.toLowerCase() === '/exit') {
        console.log("Thank you for using the Travel Agency. Goodbye!");
        return;
      }

      if (input.trim() === '') {
        console.log("Please input something to continue.");
      }
    } while (input.trim() === '');

    const session = await TravelAgent.createSession("user", input);

    while (true) {
      const userInput = await new Promise<string>((resolve) => {
        rl.question('You: ', resolve);
      });

      if (userInput.toLowerCase() === '/exit') {
        console.log("Thank you for using the Travel Agent. Shutting down...");
        await TravelAgent.shutdown();
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
