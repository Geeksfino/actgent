import { LoggingConfig } from "../../core/configs";
import { AgentSmith } from './AgentSmith';
import { Logger, logger, LogLevel} from '../../helpers/Logger';
import readline from 'readline';
import path from "path";
import os from "os";
import { program } from 'commander';

// Configure command line options
program
  .option('--log-level <level>', 'set logging level (DEBUG, INFO, WARNING, ERROR)', 'INFO')
  .parse();

const options = program.opts();
const loggerConfig: LoggingConfig = {
  destination: path.join(process.cwd(), `${AgentSmith.getName()}.log`)
};
logger.setLevel(Logger.parseLogLevel(options.logLevel));

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

AgentSmith.registerStreamCallback((delta: string) => {
  logger.info(delta);
});

const executionContext = AgentSmith.getExecutionContext();
executionContext.environment = {
  outputDirectory: path.join(process.cwd(), "generated-agents"),
  tempDirectory: path.join(os.tmpdir(), "generated-agents-temp")
};
executionContext.addToolPreference("AgentGenerator", {
  agentName: ''  
});
AgentSmith.run(loggerConfig);

async function chatLoop() {
  try {
    console.log("This is AgentSmith. I am a smith to help you create agents.");
    console.log("Type '/exit' to end the conversation.");

    let description = '';
    let agentName = '';
    let isConfirmed = false;

    while (!isConfirmed) {
      // Get agent description
      do {
        description = await new Promise<string>((resolve) => {
          rl.question('What kind of agent do you want to create?\nYou: ', resolve);
        });

        if (description.trim().toLowerCase() === '/exit') {
          console.log("Thank you for using AgentSmith. Goodbye!");
          return;
        }

        if (description.trim() === '') {
          console.log("Please input something to continue.\nYou: ");
        }
      } while (description.trim() === '');

      // Get agent name
      do {
        agentName = await new Promise<string>((resolve) => {
          rl.question('What would you like to name this agent?\nYou: ', resolve);
        });

        if (agentName.trim().toLowerCase() === '/exit') {
          console.log("Thank you for using AgentSmith. Goodbye!");
          return;
        }

        if (agentName.trim() === '') {
          console.log("How would you like to name the agent?\nYou: ");
        }
      } while (agentName.trim() === '');
      
      executionContext.addToolPreference("AgentGenerator", {
        agentName: agentName
      });

      const agentDescription = description + `\n\nThe name of this agent is ${agentName}.`;
      
      // Count words in the original description
      const wordCount = description.trim().split(/\s+/).length;
      let finalPrompt = agentDescription;

      if (wordCount < 20) {
        const enhanceConfirmation = await new Promise<string>((resolve) => {
          rl.question('Your description is quite brief. Would you like me to enhance it? (yes/no): ', resolve);
        });

        if (enhanceConfirmation.toLowerCase() === '/exit') {
          console.log("Thank you for using AgentSmith. Goodbye!");
          return;
        }

        if (enhanceConfirmation.toLowerCase() === 'yes') {
          finalPrompt = await AgentSmith.enhancePrompt(agentDescription);
          console.log(`Enhanced description: ${finalPrompt}`);
        } else {
          console.log('Proceeding with original description.');
        }
      } else {
        finalPrompt = await AgentSmith.enhancePrompt(agentDescription);
        console.log(`Enhanced description: ${finalPrompt}`);
      }
      
      // Add confirmation step
      const confirmation = await new Promise<string>((resolve) => {
        rl.question('Would you like to proceed with this agent creation? (yes/no): ', resolve);
      });

      if (confirmation.toLowerCase() === '/exit') {
        console.log("Thank you for using AgentSmith. Goodbye!");
        return;
      }

      if (confirmation.toLowerCase() === 'yes') {
        isConfirmed = true;
        description = finalPrompt;
      } else if (confirmation.toLowerCase() === 'no') {
        console.log("Let's try again.");
        // Loop will continue and ask for description again
      } else {
        console.log("Please answer 'yes' or 'no'");
      }
    }
    
    // Create session and set up response handler
    const session = await AgentSmith.createSession("user", description);
    session.onEvent((response) => {
      if (typeof response === 'string') {
        console.log(`${AgentSmith.getName()}:`, response);
      } else {
        console.log(`${AgentSmith.getName()}:`, JSON.stringify(response, null, 2));
      }
    });

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

      try {
        await session.chat(userInput);
      } catch (error) {
        console.error("Error during chat:", error);
      }
    }
  } catch (error) {
    console.error("An error occurred:", error);
  } finally {
    rl.close();
    process.exit(0);
  }
}

chatLoop();
