import { ClassificationTypeConfig, AgentBuilder, AgentServiceConfigurator, AgentCoreConfig } from '@finogeeks/actgent';

const systemEngineerTypes: ClassificationTypeConfig[] = [
    {
        name: "DEPLOYMENT_PLAN",
        description: "Create a deployment plan for the application.",
        schema: {
            deploymentPlan: {
                environment: "<DEPLOYMENT_ENVIRONMENT>",
                steps: ["<STEP_1>", "<STEP_2>"],
                monitoringSetup: "<MONITORING_DESCRIPTION>",
            },
        },
    },
    {
        name: "CLARIFICATION_NEEDED",
        description: "Request clarification on a specific topic related to system deployment or administration.",
        schema: {
            type: "object",
            properties: {
                question: { type: "string" },
                context: { type: "string" },
            },
            required: ["question"],
        },
    },
];

const systemEngineerCoreConfig: AgentCoreConfig = {
    name: "SystemEngineerAgent",
    role: "System Engineer",
    goal: "Plan and execute deployment",
    capabilities: "Deployment planning, system administration",
};

const svcConfig = AgentServiceConfigurator.getAgentConfiguration("test/multi-agents");
const agentBuilder = new AgentBuilder(systemEngineerCoreConfig, svcConfig);
export const systemEngineerAgent = agentBuilder.build("SystemEngineerAgent", systemEngineerTypes);