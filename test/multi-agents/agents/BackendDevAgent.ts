import { ClassificationTypeConfig, AgentBuilder, AgentServiceConfigurator, AgentCoreConfig } from '@finogeeks/actgent';

const backendDevTypes: ClassificationTypeConfig[] = [
    {
        name: "BACKEND_IMPLEMENTATION",
        prompt: "Implement the backend based on the system architecture.",
        schema: {
            implementation: {
                apis: ["<API_1_NAME>", "<API_2_NAME>"],
                databases: ["<DATABASE_1_NAME>", "<DATABASE_2_NAME>"],
                codeSnippet: "<SAMPLE_CODE_SNIPPET>",
            },
        },
    },
];

const backendDevCoreConfig: AgentCoreConfig = {
    name: "BackendDevAgent",
    role: "Backend Developer",
    goal: "Implement the backend",
    capabilities: "Backend development, API implementation",
};

const svcConfig = AgentServiceConfigurator.getAgentConfiguration("test/multi-agents");
const agentBuilder = new AgentBuilder(backendDevCoreConfig, svcConfig);
export const backendDevAgent = agentBuilder.build("BackendDevAgent", backendDevTypes);