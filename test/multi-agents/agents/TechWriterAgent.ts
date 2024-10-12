import { ClassificationTypeConfig, AgentBuilder, AgentServiceConfigurator, AgentCoreConfig } from '@finogeeks/actgent';

const techWriterTypes: ClassificationTypeConfig[] = [
    {
        name: "DOCUMENTATION",
        description: "As the Technical Writer, create comprehensive documentation for the Personal To-Do List Web Application. Include both user guides and technical documentation. Consider the system design, UI/UX, and deployment plans when creating the documentation.",
        schema: {
            docs: {
                userGuide: {
                    introduction: "<INTRODUCTION_TO_THE_APP>",
                    features: ["<FEATURE_1_DESCRIPTION>", "<FEATURE_2_DESCRIPTION>"],
                    gettingStarted: "<STEPS_TO_GET_STARTED>",
                    usage: {
                        createTask: "<HOW_TO_CREATE_A_TASK>",
                        editTask: "<HOW_TO_EDIT_A_TASK>",
                        deleteTask: "<HOW_TO_DELETE_A_TASK>",
                        completeTask: "<HOW_TO_MARK_TASK_AS_COMPLETE>"
                    },
                    troubleshooting: ["<COMMON_ISSUE_1>", "<COMMON_ISSUE_2>"]
                },
                technicalDocs: {
                    systemArchitecture: "<OVERVIEW_OF_SYSTEM_ARCHITECTURE>",
                    frontendTech: "<FRONTEND_TECHNOLOGY_STACK>",
                    backendTech: "<BACKEND_TECHNOLOGY_STACK>",
                    database: "<DATABASE_DETAILS>",
                    apiEndpoints: [
                        {
                            route: "<API_ROUTE>",
                            method: "<HTTP_METHOD>",
                            description: "<ENDPOINT_DESCRIPTION>",
                            parameters: ["<PARAM_1>", "<PARAM_2>"],
                            responseFormat: "<RESPONSE_FORMAT>"
                        }
                    ],
                    deployment: "<DEPLOYMENT_INSTRUCTIONS>",
                    maintenance: "<MAINTENANCE_GUIDELINES>"
                }
            }
        },
    },
    {
        name: "DOCUMENTATION_UPDATE",
        description: "Update the existing documentation based on recent changes or feedback. Ensure all sections are up-to-date and accurately reflect the current state of the application.",
        schema: {
            updatedSections: [
                {
                    section: "<SECTION_NAME>",
                    changes: "<DESCRIPTION_OF_CHANGES>",
                    reason: "<REASON_FOR_UPDATE>"
                }
            ],
            newSections: [
                {
                    name: "<NEW_SECTION_NAME>",
                    content: "<NEW_SECTION_CONTENT>"
                }
            ]
        },
    },
];

const techWriterCoreConfig: AgentCoreConfig = {
    name: "TechWriterAgent",
    role: "Technical Writer",
    goal: "Create comprehensive and user-friendly documentation for the application",
    capabilities: "Technical writing, user guide creation, API documentation, system architecture documentation",
};

const svcConfig = AgentServiceConfigurator.getAgentConfiguration("test/multi-agents");
const agentBuilder = new AgentBuilder(techWriterCoreConfig, svcConfig);
export const techWriterAgent = agentBuilder.build("TechWriterAgent", techWriterTypes);