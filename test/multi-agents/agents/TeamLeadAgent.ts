import { ClassificationTypeConfig } from '@finogeeks/actgent';
import { createAgent } from '../utils';

const teamLeadTypes: ClassificationTypeConfig[] = [
    {
        name: "TASK_ASSIGNMENT",
        prompt: "Assign tasks to team members based on the project requirements.",
        schema: {
            assignments: [
                {
                    role: "<TEAM_MEMBER_ROLE>",
                    task: "<TASK_DESCRIPTION>",
                }
            ],
        },
    },
];

export const { agent: teamLeadAgent, name: teamLeadName } = createAgent(
    "TeamLeadAgent",
    "Team Lead",
    "Coordinate the team and assign tasks",
    "Task assignment, project coordination",
    teamLeadTypes
);