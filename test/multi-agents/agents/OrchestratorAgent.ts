import { ClassificationTypeConfig, AgentBuilder, AgentServiceConfigurator, AgentCoreConfig } from '@finogeeks/actgent';

const orchestratorTypes: ClassificationTypeConfig[] = [
    {
        name: "TASK_CLASSIFICATION",
        description: "Classification of the user message to determine the nature of the task caused by this message. This will be used to determine which agent should handle the task.",
        schema: {
            classification: {
                taskType: "<TASK_TYPE>",
                confidence: "<CONFIDENCE_SCORE>",
                reason: "<REASON_FOR_CLASSIFICATION>"
            }
        },
    },
    {
        name: "USER_RESPONSE",
        description: "A response to be sent back to the user.",
        schema: {
            message: "<MESSAGE_TO_USER>"
        },
    },
    {
        name: "CLARIFICATION_NEEDED",
        description: "The questions that need further clarification from the user.",
        schema: {
            questions: ["<QUESTION_1>", "<QUESTION_2>", "..."],
        },
    },
];

const orchestratorCoreConfig: AgentCoreConfig = {
    name: "OrchestratorAgent",
    role: "Project Coordinator",
    goal: "Coordinate the software development process by managing communication between the user and specialized agents, classifying user messages, and directing them to the appropriate agent.",
    capabilities: "Task classification, task delegation, communication management, project coordination",
};

const svcConfig = AgentServiceConfigurator.getAgentConfiguration("test/multi-agents");
const agentBuilder = new AgentBuilder(orchestratorCoreConfig, svcConfig);
const orchestratorAgent = agentBuilder.build("OrchestratorAgent", orchestratorTypes);

orchestratorAgent.addInstruction("Task Classification Guidelines", `
As the Orchestrator, your primary task is to analyze user messages and determine which specialized agent should handle them as tasks. Follow these guidelines:

1. Carefully read and understand the user's message.
2. Classify the message into one of the following task types:
   - REQUIREMENTS: The message signifies a need for requirements analysis and proper documentation.
   - PRODUCT_MANAGEMENT: The message signifies a need for product planning, feature definition, or user stories.
   - SPEC_WRITING: The message signifies a need for software functional specification writing.
   - ARCHITECTURE: The message signifies a need for system architecture design or technical design.
   - FRONTEND_DEVELOPMENT: The message signifies a need for frontend code development.
   - BACKEND_DEVELOPMENT: The message signifies a need for backend code development or APIs.
   - TESTING: The message signifies a need for quality assurance or testing.
   - DEPLOYMENT: The message signifies a need for system deployment or DevOps.
   - PROJECT_MANAGEMENT: The message signifies a need for project planning, timelines, or resource allocation.
   - GENERAL: General questions or tasks that don't fit into the above categories.

3. Provide a confidence score (0-100) for your classification.
4. Explain the reason for your classification.
5. If the message is unclear or requires more information, generate clarification questions.

Your output should be in the following format, note that the taskType should only be one of the task types listed above and anything else is an error:
{
    "classification": {
        "taskType": "<TASK_TYPE>",
        "confidence": <CONFIDENCE_SCORE>,
        "reason": "<REASON_FOR_CLASSIFICATION>"
    }
}

Or, if clarification is needed:
{
    "questions": [
        "<QUESTION_1>",
        "<QUESTION_2>",
        "..."
    ]
}
`);

export { orchestratorAgent };
