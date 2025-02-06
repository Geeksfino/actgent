import { ClassificationTypeConfig, AgentBuilder, AgentServiceConfigurator, AgentCoreConfig } from '@finogeeks/actgent';

const architectTypes: ClassificationTypeConfig[] = [
    {
        name: "SYSTEM_DESIGN",
        description: "As the System Architect, design a comprehensive and scalable architecture for the project. Consider performance, security, and maintainability. Provide a detailed breakdown of components, their interactions, and the rationale behind your choices.",
        schema: {
            architecture: {
                frontend: {
                    framework: "<FRONTEND_FRAMEWORK>",
                    stateManagement: "<STATE_MANAGEMENT_SOLUTION>",
                    majorComponents: ["<COMPONENT_1>", "<COMPONENT_2>"]
                },
                backend: {
                    language: "<BACKEND_LANGUAGE>",
                    framework: "<BACKEND_FRAMEWORK>",
                    apiDesign: "<API_DESIGN_APPROACH>",
                    majorServices: ["<SERVICE_1>", "<SERVICE_2>"]
                },
                database: {
                    type: "<DATABASE_TYPE>",
                    schema: "<HIGH_LEVEL_SCHEMA_DESCRIPTION>",
                    scalingStrategy: "<SCALING_STRATEGY>"
                },
                infrastructure: {
                    hosting: "<HOSTING_SOLUTION>",
                    cicd: "<CI_CD_PIPELINE_DESCRIPTION>",
                    monitoring: "<MONITORING_SOLUTION>"
                },
                securityMeasures: ["<SECURITY_MEASURE_1>", "<SECURITY_MEASURE_2>"],
                scalabilityConsiderations: ["<SCALABILITY_CONSIDERATION_1>", "<SCALABILITY_CONSIDERATION_2>"]
            },
            rationale: "<DETAILED_RATIONALE_FOR_ARCHITECTURAL_CHOICES>"
        },
    },
];

const architectCoreConfig: AgentCoreConfig = {
    name: "ArchitectAgent",
    role: "Architect",
    goal: "Design a robust, scalable, and efficient system architecture",
    capabilities: "High-level system design, technology stack selection, scalability planning, security architecture, performance optimization, integration design, cloud architecture, microservices design",
};

const svcConfig = AgentServiceConfigurator.getAgentConfiguration("test/multi-agents");
const agentBuilder = new AgentBuilder(architectCoreConfig, svcConfig);
export const architectAgent = agentBuilder.build("ArchitectAgent", architectTypes);