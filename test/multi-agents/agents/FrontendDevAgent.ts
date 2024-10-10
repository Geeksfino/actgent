import { ClassificationTypeConfig, AgentBuilder, AgentServiceConfigurator, AgentCoreConfig } from '@finogeeks/actgent';

const frontendDevTypes: ClassificationTypeConfig[] = [
    {
        name: "FRONTEND_IMPLEMENTATION",
        prompt: "Implement the frontend based on the UI design and system architecture.",
        schema: {
            implementation: {
                components: ["<COMPONENT_1_NAME>", "<COMPONENT_2_NAME>"],
                pages: ["<PAGE_1_NAME>", "<PAGE_2_NAME>"],
                codeSnippet: "<SAMPLE_CODE_SNIPPET>",
            },
        },
    },
];

const frontendDevCoreConfig: AgentCoreConfig = {
    name: "FrontendDevAgent",
    role: "Frontend Developer",
    goal: "Implement the frontend",
    capabilities: "Frontend development, UI implementation",
};

const svcConfig = AgentServiceConfigurator.getAgentConfiguration("test/multi-agents");
const agentBuilder = new AgentBuilder(frontendDevCoreConfig, svcConfig);
export const frontendDevAgent = agentBuilder.build("FrontendDevAgent", frontendDevTypes);