import { ClassificationTypeConfig, AgentBuilder, AgentServiceConfigurator, AgentCoreConfig } from '@finogeeks/actgent';

const productManagerTypes: ClassificationTypeConfig[] = [
    {
        name: "REQUIREMENTS_ANALYSIS",
        prompt: "Analyze user requirements and create user stories.",
        schema: {
            userStories: [
                {
                    id: "<STORY_ID>",
                    description: "<USER_STORY_DESCRIPTION>",
                    acceptanceCriteria: ["<CRITERION_1>", "<CRITERION_2>"],
                }
            ],
        },
    },
];

const productManagerCoreConfig: AgentCoreConfig = {
    name: "ProductManagerAgent",
    role: "Product Manager",
    goal: "Analyze requirements and create user stories",
    capabilities: "Requirements analysis, user story creation",
};

const svcConfig = AgentServiceConfigurator.getAgentConfiguration("test/multi-agents");
const agentBuilder = new AgentBuilder(productManagerCoreConfig, svcConfig);
export const productManagerAgent = agentBuilder.build("ProductManagerAgent", productManagerTypes);