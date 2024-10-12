import { ClassificationTypeConfig, AgentBuilder, AgentServiceConfigurator, AgentCoreConfig } from '@finogeeks/actgent';

const productManagerTypes: ClassificationTypeConfig[] = [
    {
        name: "FUNCTIONAL_SPECIFICATION",
        description: "As the Product Manager, analyze the project requirements and create a comprehensive functional specification. Include detailed feature descriptions, user stories, and acceptance criteria.",
        schema: {
            specification: {
                projectOverview: "<PROJECT_OVERVIEW>",
                targetAudience: "<TARGET_AUDIENCE_DESCRIPTION>",
                features: [
                    {
                        name: "<FEATURE_NAME>",
                        description: "<FEATURE_DESCRIPTION>",
                        userStories: ["<USER_STORY_1>", "<USER_STORY_2>"],
                        acceptanceCriteria: ["<CRITERION_1>", "<CRITERION_2>"]
                    }
                ],
                nonFunctionalRequirements: ["<REQUIREMENT_1>", "<REQUIREMENT_2>"],
                constraints: ["<CONSTRAINT_1>", "<CONSTRAINT_2>"]
            }
        },
    },
    // ... (keep other types like FEATURE_REFINEMENT if needed)
];

const productManagerCoreConfig: AgentCoreConfig = {
    name: "ProductManagerAgent",
    role: "Product Manager",
    goal: "Define product features and create comprehensive functional specifications",
    capabilities: "Requirements analysis, feature definition, user story creation, market analysis, stakeholder communication",
};

const svcConfig = AgentServiceConfigurator.getAgentConfiguration("test/multi-agents");
const agentBuilder = new AgentBuilder(productManagerCoreConfig, svcConfig);
export const productManagerAgent = agentBuilder.build("ProductManagerAgent", productManagerTypes);