import { AgentCoreConfig, AgentServiceConfig, ToolOutput } from '@finogeeks/actgent';
import { AgentServiceConfigurator } from '@finogeeks/actgent';
import { AgentBuilder } from '@finogeeks/actgent';

const coreConfig: AgentCoreConfig = {
  name: "BaseAgent",
  role: "Software Product Manager",
  goal: 'Create software specification',
  capabilities: 'assist in testing',
};

// Define service config with networking enabled
const svcConfig = await AgentServiceConfigurator.getAgentConfiguration("test/basic");

// If you need to override communication config, do it after getting the base config
svcConfig.communicationConfig = {
  host: 'localhost',
  httpPort: 3000
};

console.log("Service config:", JSON.stringify(svcConfig, null, 2));

// Define the schema types
const schemaTypes = [
  {
    name: "SIMPLE_QUERY",
    description: "A straightforward question that can be answered directly.",
    schema: {
      answer: "<DIRECT_ANSWER_TO_QUERY>",
    },
  },
  {
    name: "COMPLEX_TASK",
    description: "A task that requires multiple steps or extended processing.",
    schema: {
      actionPlan: {
        task: "<MAIN_OBJECTIVE>",
        subtasks: ["<SUBTASK_1>", "<SUBTASK_2>", "..."],
      },
    },
  },
  {
    name: "CLARIFICATION_NEEDED",
    description: "The message needs clarification.",
    schema: {
      questions: ["<QUESTION_1>", "<QUESTION_2>", "..."],
    },
  },
  {
    name: "COMMAND",
    description: "An instruction to perform a specific action.",
    schema: {
      command: {
        action: "<SPECIFIC_ACTION>",
        parameters: {
          "<PARAM_1>": "<VALUE_1>",
          "<PARAM_2>": "<VALUE_2>",
          "...": "...",
        },
        expectedOutcome: "<DESCRIPTION_OF_EXPECTED_RESULT>",
      },
    },
  },
] as const;

async function main() {
  try {
    // Use AgentBuilder to create the agent
    const agentBuilder = new AgentBuilder(coreConfig, svcConfig);
    const testAgent = agentBuilder.build("TestAgent", [...schemaTypes]);

    // Register stream callback for console output
    testAgent.registerStreamCallback((delta: string) => {
      process.stdout.write(delta);
    });

    // Start the agent (this will also start the HTTP server)
    await testAgent.run();
    console.log(`Agent started and listening on http://localhost:${svcConfig.communicationConfig?.httpPort}`);

    // Optional: Create a test session directly
    const session = await testAgent.createSession("owner", 'How to create web site?');

    // Update the handler to handle both classification and tool outputs
    const handler = (data: { messageType: string } & Record<string, any> | ToolOutput): void => {
      console.log("Received event from session:", JSON.stringify(data, null, 2));
    };

    // Pass the handler to the session
    session.onEvent(handler);

    // Keep the process running
    process.on('SIGINT', async () => {
      console.log('Shutting down...');
      await testAgent.shutdown();
      process.exit(0);
    });

  } catch (error) {
    console.error('Error starting agent:', error);
    process.exit(1);
  }
}

main();
