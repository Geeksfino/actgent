import {
  AgentBuilder,
  AgentServiceConfigurator,
  AgentCoreConfig,
} from "@finogeeks/actgent";
import { DefaultSchemaBuilder } from "@finogeeks/actgent";

const schemaBuilder = new DefaultSchemaBuilder();

const orchestratorTemplate = {
  taskType: "<TASK_TYPE>",
  state: "<TASK_STATE>",
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
As the Orchestrator, your task is to classify messages and determine the next action based on both the message content and the task's current state. Follow these steps:

1. Carefully read and understand the user's message and review the current task state.
2. Determine the appropriate next step based on the task's current state:
   - REQUIREMENTS: If the task is in the initial stage and needs further requirements gathering, analysis, or documentation, classify it as REQUIREMENTS. 
   - DECISION_MAKING: The message signifies a decision or confirmation that needs to be made by the user with the given options. 
   - CLARIFICATION: The message signifies a need for clarification or more information about a task by USER.
   - PRODUCT_MANAGEMENT: If the task has sufficient requirements and is ready for product planning or user stories, classify it as PRODUCT_MANAGEMENT.
   - SPEC_WRITING: The message looks like a product plan or a feature plan and signifies a need for software functional specification writing.
   - ARCHITECTURE: The message signifies a need for system architecture design or technical design.
   - FRONTEND_DEVELOPMENT: If the product plan is complete, classify it as FRONTEND_DEVELOPMENT
   - BACKEND_DEVELOPMENT: The message signifies a need for backend code development or APIs.
   - TESTING: If development is complete, classify it as TESTING for quality assurance.
   - DEPLOYMENT: If the task is fully developed and tested, classify it as DEPLOYMENT.
   - PROJECT_MANAGEMENT: The message signifies a need for project planning, timelines, or resource allocation.
   - OTHER: The message is not a task and needs to be relayed back to the original requester.
   - COMPLETED: If the task is fully deployed or no further action is required, mark it as completed.

3. Provide a confidence score (0-100) for your classification.
4. Explain the reason for your classification.
5. If the message requires more information or is unclear, output CLARIFICATION_NEEDED.
6. Update the task state after each classification to prevent reclassifying the same message.

When a task is classified, use the TASK_COMPLETE output with the following structure:

${JSON.stringify(schemaBuilder.getSchema(DefaultSchemaBuilder.TASK_COMPLETE))}

`
);

export { orchestratorAgent };
