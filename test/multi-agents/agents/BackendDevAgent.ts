import { ClassificationTypeConfig } from '@finogeeks/actgent';
import { createAgent } from '../utils';

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

export const { agent: backendDevAgent, name: backendDevName } = createAgent(
    "BackendDevAgent",
    "Backend Developer",
    "Implement the backend",
    "Backend development, API implementation",
    backendDevTypes
);