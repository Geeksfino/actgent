import { ClassificationTypeConfig } from '@finogeeks/actgent';
import { createAgent } from '../utils';

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

export const { agent: architectAgent, name: architectName } = createAgent(
    "ArchitectAgent",
    "System Architect",
    "Design the system architecture",
    "System design, technology stack selection",
    architectTypes
);