import { ClassificationTypeConfig } from '@finogeeks/actgent';
import { createAgent } from '../utils';

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

export const { agent: productManagerAgent, name: productManagerName } = createAgent(
    "ProductManagerAgent",
    "Product Manager",
    "Analyze requirements and create user stories",
    "Requirements analysis, user story creation",
    productManagerTypes
);