import { ClassificationTypeConfig } from '@finogeeks/actgent/core';
import { InferClassificationUnion } from '@finogeeks/actgent/core';
import { AgentServiceConfigurator } from '@finogeeks/actgent/agent';
import { AgentBuilder } from '@finogeeks/actgent/agent';

const coreConfig = {
  name: "BaseAgent",
  role: "Software Product Manager",
  goal: 'Create software specification',
  capabilities: 'assist in testing',
};

// make sure to set the correct agent configuration in .agent.env file - rename .agent.env.example to .agent.env and edit as needed
const svcConfig = AgentServiceConfigurator.getAgentConfiguration("test/test-agent");
console.log("service config: " + JSON.stringify(svcConfig));

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
];

// Use AgentBuilder to create the agent
const agentBuilder = new AgentBuilder(coreConfig, svcConfig);
const testAgent = agentBuilder.build("TestAgent", schemaTypes);

testAgent.registerStreamCallback((delta: string) => {
  console.log(delta);
});
testAgent.run();

const session = await testAgent.createSession("owner", 'How to create web site?');

// Handler function to print out data received
const handler = (data: InferClassificationUnion<readonly ClassificationTypeConfig[]>): void => {
  console.log("Received event from session:", data);
};

// Pass the handler to the session
session.onEvent(handler);
console.log("session completed");
