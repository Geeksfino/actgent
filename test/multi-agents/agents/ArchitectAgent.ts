import { ClassificationTypeConfig, AgentBuilder, AgentServiceConfigurator, AgentCoreConfig } from '@finogeeks/actgent';

const architectTypes: ClassificationTypeConfig[] = [
    {
        name: "SYSTEM_DESIGN",
        prompt: "Design the overall system architecture based on the requirements.",
        schema: {
            architecture: {
                frontend: "<FRONTEND_TECHNOLOGY_STACK>",
                backend: "<BACKEND_TECHNOLOGY_STACK>",
                database: "<DATABASE_CHOICE>",
                apis: ["<API_1_DESCRIPTION>", "<API_2_DESCRIPTION>"],
            },
        },
    },
];

const architectCoreConfig: AgentCoreConfig = {
    name: "ArchitectAgent",
    role: "System Architect",
    goal: "Design the system architecture",
    capabilities: "System design, technology stack selection",
};

const svcConfig = AgentServiceConfigurator.getAgentConfiguration("test/multi-agents");
const agentBuilder = new AgentBuilder(architectCoreConfig, svcConfig);
export const architectAgent = agentBuilder.build("ArchitectAgent", architectTypes);