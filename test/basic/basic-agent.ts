import { AgentCoreConfig, AgentServiceConfig, ToolOutput } from '@finogeeks/actgent';
import { AgentServiceConfigurator } from '@finogeeks/actgent';
import { AgentBuilder } from '@finogeeks/actgent';
import { program } from 'commander';
import { logger, LogLevel } from '../../src/core/Logger';

// Configure command line options
program
  .option('-l, --local', 'run in local mode (no HTTP server)')
  .option('--log-level <level>', 'set logging level (trace, debug, info, warn, error, fatal)', 'info')
  .option('-n, --network', 'enable network mode with HTTP and streaming servers', false)
  .option('--http-port <port>', 'HTTP server port (network mode only)', '5678')
  .option('--stream-port <port>', 'streaming server port (network mode only)', '5679')
  .option('--description <text>', 'Input description for local mode')
  .option('--event-source', 'Use EventSource-based implementation for streaming');

// Show help if no arguments
if (process.argv.length === 2) {
  program.help();
}

program.parse();
const options = program.opts();

// Configure logging
logger.setLevel(options.logLevel?.toLowerCase() as LogLevel || 'info');

const coreConfig: AgentCoreConfig = {
  name: "BaseAgent",
  role: "Software Product Manager",
  goal: 'Create software specification',
  capabilities: 'assist in testing',
};

// Define service config with networking enabled
const svcConfig = await AgentServiceConfigurator.getAgentConfiguration("test/basic");

// Configure communication based on mode
if (options.network) {
  console.log("Running in network mode with HTTP streaming enabled");
  // In network mode, we enable HTTP streaming but LLM streaming is controlled by LLM_STREAM_MODE
  svcConfig.communicationConfig = {
    ...svcConfig.communicationConfig,
    httpPort: parseInt(options.httpPort),
    streamPort: parseInt(options.streamPort),
    enableStreaming: true  // Enable HTTP streaming for network mode
  };
} else {
  // In local mode, we disable HTTP/network features but LLM streaming is still controlled by LLM_STREAM_MODE
  if (!options.description) {
    console.error("Error: --description is required in local mode");
    process.exit(1);
  }
  console.log("Running in local mode (no network services)");
  svcConfig.communicationConfig = {
    ...svcConfig.communicationConfig,
    httpPort: undefined,
    streamPort: undefined,
    enableStreaming: false  // Disable HTTP streaming in local mode
  };
}

// Log the final configuration showing both LLM and HTTP streaming states
console.log("Service config:", JSON.stringify({
  ...svcConfig,
  llmConfig: {
    ...svcConfig.llmConfig,
    apiKey: '***'  // Mask API key in logs
  }
}, null, 2));

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

    // Register stream callback in local mode
    if (!options.network) {
      testAgent.registerStreamCallback((delta: string) => {
        process.stdout.write(delta);
      });
    }

    // Start the agent
    await testAgent.run();

    // Handle local mode
    if (!options.network) {
      // Create session with command line description
      await testAgent.createSession("test", options.description);
    } else {
      // Start monitoring the stream first and keep it alive
      console.log(`Agent started and listening on:`);
      console.log(`- HTTP: http://localhost:${svcConfig.communicationConfig?.httpPort}`);
      if (svcConfig.communicationConfig?.enableStreaming) {
        console.log(`- Streaming: http://localhost:${svcConfig.communicationConfig?.streamPort}`);
      }

      // Then wait for session creation
      console.log('\nWaiting for session creation via HTTP endpoint...');
      console.log('Example:');
      console.log('curl -X POST http://localhost:5678/createSession \\');
      console.log('  -H "Content-Type: application/json" \\');
      console.log('  -d \'{"owner":"test", "description":"how to develop a miniprogram"}\'');
    }

    // Keep the process alive
    await new Promise((resolve) => {
      process.on('SIGINT', async () => {
        console.log('\nShutting down...');
        await testAgent.shutdown();
        resolve(null);
      });
    });
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
