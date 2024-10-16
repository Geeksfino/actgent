import {
  AgentBuilder,
  AgentServiceConfigurator,
  AgentCoreConfig,
} from "@finogeeks/actgent";
import { DefaultSchemaBuilder } from "@finogeeks/actgent";

const schemaBuilder = new DefaultSchemaBuilder();

const orchestratorTemplate = {
  taskType: "<TASK_TYPE>",
  confidence: "<CONFIDENCE_SCORE>",
  reason: "<REASON_FOR_CLASSIFICATION>",
};

schemaBuilder.setFormattedOutputForCompletedTask(`
  ${JSON.stringify(orchestratorTemplate)}
`);

const orchestratorCoreConfig: AgentCoreConfig = {
  name: "OrchestratorAgent",
  role: "Project Coordinator",
  goal: "Coordinate the software development process by managing communication between the user and specialized agents, classifying user messages for directing them to the appropriate agent, and relaying any agent clarification requests or confirmation requests back to the user.",
  capabilities:
    "Task classification, task delegation, communication management, project coordination, relaying clarification requests and confirmation requests to the user",
};

const svcConfig =
  AgentServiceConfigurator.getAgentConfiguration("test/multi-agents");
const agentBuilder = new AgentBuilder(orchestratorCoreConfig, svcConfig);
const orchestratorAgent = agentBuilder.build(
  "OrchestratorAgent",
  schemaBuilder.getClassificationTypes()
);

orchestratorAgent.addInstruction(
  "Task Classification Guidelines",
  `
As the Orchestrator, your primary task is to analyze user messages and determine which specialized agent should handle them as tasks. Follow these guidelines:

1. Carefully read and understand the user's message.
2. Classify the message into one of the following task types:
   - REQUIREMENTS: The message signifies a need for requirements gathering, analysis and documentation by an agent. 
   - DECISION_MAKING: The message signifies a decision or confirmation that needs to be made by the user with the given options. 
   - CLARIFICATION: The message signifies a need for clarification or more information about a task by USER.
   - PRODUCT_MANAGEMENT: The message signifies a need for product planning, feature definition, or user stories based on the requirements.
   - SPEC_WRITING: The message looks like a product plan or a feature plan and signifies a need for software functional specification writing.
   - ARCHITECTURE: The message signifies a need for system architecture design or technical design.
   - FRONTEND_DEVELOPMENT: The message signifies a need for frontend code development.
   - BACKEND_DEVELOPMENT: The message signifies a need for backend code development or APIs.
   - TESTING: The message signifies a need for quality assurance or testing.
   - DEPLOYMENT: The message signifies a need for system deployment or DevOps.
   - PROJECT_MANAGEMENT: The message signifies a need for project planning, timelines, or resource allocation.
   - OTHER: The message is not a task and needs to be relayed back to the original requester.

3. Provide a confidence score (0-100) for your classification.
4. Explain the reason for your classification.
5. If the message is unclear or requires more information, use the CLARIFICATION_NEEDED output.

When a task is classified, use the TASK_COMPLETE output with the following structure:

${JSON.stringify(schemaBuilder.getSchema(DefaultSchemaBuilder.TASK_COMPLETE))}

`
);

export { orchestratorAgent };
