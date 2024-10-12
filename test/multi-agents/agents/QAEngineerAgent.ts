import { ClassificationTypeConfig, AgentBuilder, AgentServiceConfigurator, AgentCoreConfig } from '@finogeeks/actgent';

const qaEngineerTypes: ClassificationTypeConfig[] = [
    {
        name: "TEST_PLAN",
        description: "Create a test plan for the implemented features.",
        schema: {
            testPlan: {
                testCases: ["<TEST_CASE_1_DESCRIPTION>", "<TEST_CASE_2_DESCRIPTION>"],
                testScenarios: ["<SCENARIO_1_DESCRIPTION>", "<SCENARIO_2_DESCRIPTION>"],
                automationStrategy: "<AUTOMATION_STRATEGY_DESCRIPTION>",
            },
        },
    },
];

const qaEngineerCoreConfig: AgentCoreConfig = {
    name: "QAEngineerAgent",
    role: "QA Engineer",
    goal: "Create and execute test plans",
    capabilities: "Quality assurance, test planning",
};

const svcConfig = AgentServiceConfigurator.getAgentConfiguration("test/multi-agents");
const agentBuilder = new AgentBuilder(qaEngineerCoreConfig, svcConfig);
export const qaEngineerAgent = agentBuilder.build("QAEngineerAgent", qaEngineerTypes);