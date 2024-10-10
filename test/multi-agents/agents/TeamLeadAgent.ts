import { ClassificationTypeConfig, AgentBuilder, AgentServiceConfigurator, AgentCoreConfig } from '@finogeeks/actgent';

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

const teamLeadCoreConfig: AgentCoreConfig = {
    name: "TeamLeadAgent",
    role: "Team Lead",
    goal: "Coordinate the team and assign tasks",
    capabilities: "Task assignment, project coordination",
};

const svcConfig = AgentServiceConfigurator.getAgentConfiguration("test/multi-agents");
const agentBuilder = new AgentBuilder(teamLeadCoreConfig, svcConfig);
export const teamLeadAgent = agentBuilder.build("TeamLeadAgent", teamLeadTypes);