import { ClassificationTypeConfig, AgentBuilder, AgentServiceConfigurator, AgentCoreConfig } from '@finogeeks/actgent';

const projectManagerTypes: ClassificationTypeConfig[] = [
    {
        name: "PROJECT_PLAN",
        description: "As the Project Manager, create a comprehensive project delivery plan based on the functional specification, UI design, and system architecture. Break down tasks for frontend and backend development, QA testing, and deployment.",
        schema: {
            plan: {
                projectTimeline: "<OVERALL_PROJECT_TIMELINE>",
                milestones: ["<MILESTONE_1>", "<MILESTONE_2>", "<MILESTONE_3>"],
                frontendTasks: [
                    {
                        task: "<TASK_DESCRIPTION>",
                        estimatedDuration: "<DURATION>",
                        dependencies: ["<DEPENDENCY_1>", "<DEPENDENCY_2>"]
                    }
                ],
                backendTasks: [
                    {
                        task: "<TASK_DESCRIPTION>",
                        estimatedDuration: "<DURATION>",
                        dependencies: ["<DEPENDENCY_1>", "<DEPENDENCY_2>"]
                    }
                ],
                testingTasks: [
                    {
                        task: "<TASK_DESCRIPTION>",
                        estimatedDuration: "<DURATION>",
                        dependencies: ["<DEPENDENCY_1>", "<DEPENDENCY_2>"]
                    }
                ],
                deploymentTasks: [
                    {
                        task: "<TASK_DESCRIPTION>",
                        estimatedDuration: "<DURATION>",
                        dependencies: ["<DEPENDENCY_1>", "<DEPENDENCY_2>"]
                    }
                ]
            }
        },
    },
    {
        name: "PROJECT_CONCLUSION",
        description: "Review the project outcomes, including test results and deployment results. Provide a conclusion on the project delivery and any lessons learned.",
        schema: {
            conclusion: {
                overallStatus: "<PROJECT_STATUS>",
                accomplishments: ["<ACCOMPLISHMENT_1>", "<ACCOMPLISHMENT_2>"],
                challenges: ["<CHALLENGE_1>", "<CHALLENGE_2>"],
                lessonsLearned: ["<LESSON_1>", "<LESSON_2>"],
                nextSteps: ["<NEXT_STEP_1>", "<NEXT_STEP_2>"]
            }
        },
    },
];

const projectManagerCoreConfig: AgentCoreConfig = {
    name: "ProjectManagerAgent",
    role: "Project Manager",
    goal: "Create and manage project delivery plans, coordinate team efforts, and ensure successful project completion",
    capabilities: "Project planning, task assignment, risk management, progress tracking, stakeholder communication, project evaluation",
};

const svcConfig = AgentServiceConfigurator.getAgentConfiguration("test/multi-agents");
const agentBuilder = new AgentBuilder(projectManagerCoreConfig, svcConfig);
export const projectManagerAgent = agentBuilder.build("ProjectManagerAgent", projectManagerTypes);