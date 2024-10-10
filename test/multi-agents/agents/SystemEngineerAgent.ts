import { ClassificationTypeConfig } from '@finogeeks/actgent';
import { createAgent } from '../utils';

const systemEngineerTypes: ClassificationTypeConfig[] = [
    {
        name: "DEPLOYMENT_PLAN",
        prompt: "Create a deployment plan for the application.",
        schema: {
            deploymentPlan: {
                environment: "<DEPLOYMENT_ENVIRONMENT>",
                steps: ["<STEP_1>", "<STEP_2>"],
                monitoringSetup: "<MONITORING_DESCRIPTION>",
            },
        },
    },
];

export const { agent: systemEngineerAgent, name: systemEngineerName } = createAgent(
    "SystemEngineerAgent",
    "System Engineer",
    "Plan and execute deployment",
    "Deployment planning, system administration",
    systemEngineerTypes
);