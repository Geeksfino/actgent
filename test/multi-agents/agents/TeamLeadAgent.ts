import { ClassificationTypeConfig, AgentBuilder, AgentServiceConfigurator, AgentCoreConfig } from '@finogeeks/actgent';

const teamLeadTypes: ClassificationTypeConfig[] = [
    {
        name: "TASK_ASSIGNMENT",
        description: "As the Team Lead, analyze the project requirements and assign high-level tasks to team members. Consider the expertise of each role and the project's needs. Provide a comprehensive task breakdown that covers all aspects of the development process.",
        schema: {
            assignments: [
                {
                    role: "<TEAM_MEMBER_ROLE>",
                    task: "<DETAILED_TASK_DESCRIPTION>",
                    priority: "<TASK_PRIORITY>",
                    estimatedDuration: "<ESTIMATED_TIME_TO_COMPLETE>"
                }
            ],
            keyMilestones: ["<MILESTONE_1>", "<MILESTONE_2>", "<MILESTONE_3>"]
        },
    },
    {
        name: "PROGRESS_REVIEW",
        description: "Review the progress of the project based on the latest updates from team members. Identify any bottlenecks, risks, or areas that need attention. Provide recommendations for keeping the project on track.",
        schema: {
            status: "<OVERALL_PROJECT_STATUS>",
            completedTasks: ["<COMPLETED_TASK_1>", "<COMPLETED_TASK_2>"],
            ongoingTasks: ["<ONGOING_TASK_1>", "<ONGOING_TASK_2>"],
            risks: ["<RISK_1>", "<RISK_2>"],
            recommendations: ["<RECOMMENDATION_1>", "<RECOMMENDATION_2>"]
        },
    },
];

const teamLeadCoreConfig: AgentCoreConfig = {
    name: "TeamLeadAgent",
    role: "Team Lead",
    goal: "Coordinate the development team, assign tasks, and ensure project success",
    capabilities: "Project management, task assignment and prioritization, risk assessment and mitigation, team coordination and communication, progress tracking and reporting, decision making and problem-solving",
};

const svcConfig = AgentServiceConfigurator.getAgentConfiguration("test/multi-agents");
const agentBuilder = new AgentBuilder(teamLeadCoreConfig, svcConfig);
export const teamLeadAgent = agentBuilder.build("TeamLeadAgent", teamLeadTypes);