import { ClassificationTypeConfig } from '@finogeeks/actgent';
import { createAgent } from '../utils';

const qaEngineerTypes: ClassificationTypeConfig[] = [
    {
        name: "TEST_PLAN",
        prompt: "Create a test plan for the implemented features.",
        schema: {
            testPlan: {
                testCases: ["<TEST_CASE_1_DESCRIPTION>", "<TEST_CASE_2_DESCRIPTION>"],
                testScenarios: ["<SCENARIO_1_DESCRIPTION>", "<SCENARIO_2_DESCRIPTION>"],
                automationStrategy: "<AUTOMATION_STRATEGY_DESCRIPTION>",
            },
        },
    },
];

export const { agent: qaEngineerAgent, name: qaEngineerName } = createAgent(
    "QAEngineerAgent",
    "QA Engineer",
    "Create and execute test plans",
    "Quality assurance, test planning",
    qaEngineerTypes
);