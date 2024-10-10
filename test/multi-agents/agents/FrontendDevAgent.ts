import { ClassificationTypeConfig } from '@finogeeks/actgent';
import { createAgent } from '../utils';

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

export const { agent: frontendDevAgent, name: frontendDevName } = createAgent(
    "FrontendDevAgent",
    "Frontend Developer",
    "Implement the frontend",
    "Frontend development, UI implementation",
    frontendDevTypes
);