import { InferClassificationUnion, ClassificationTypeConfig } from '@finogeeks/actgent';
import fs from 'fs';
import path from 'path';
import { projectsDir } from './utils';

// Import all agents
import { teamLeadAgent } from './agents/TeamLeadAgent';
import { productManagerAgent } from './agents/ProductManagerAgent';
import { architectAgent } from './agents/ArchitectAgent';
import { uiDesignerAgent } from './agents/UIDesignerAgent';
import { frontendDevAgent } from './agents/FrontendDevAgent';
import { backendDevAgent } from './agents/BackendDevAgent';
import { qaEngineerAgent } from './agents/QAEngineerAgent';
import { systemEngineerAgent } from './agents/SystemEngineerAgent';

// Main program
async function main() {
    const userInput = process.argv[2];
    if (!userInput) {
        console.error("Please provide a user requirement as a command-line argument.");
        process.exit(1);
    }

    console.log("Starting the software development process...");

    // Run all agents
    const agents = [
        teamLeadAgent,
        productManagerAgent,
        architectAgent,
        uiDesignerAgent,
        frontendDevAgent,
        backendDevAgent,
        qaEngineerAgent,
        systemEngineerAgent
    ];

    for (const agent of agents) {
        agent.registerStreamCallback((delta: string) => {
            console.log(`${agent.getName()} output:`, delta);
        });
        await agent.run();
    }

    // Team Lead initiates the process
    const teamLeadSession = await teamLeadAgent.createSession("user", userInput);
    teamLeadSession.onEvent((data: InferClassificationUnion<readonly ClassificationTypeConfig[]>) => {
        if (data.messageType === "TASK_ASSIGNMENT") {
            console.log("Team Lead has assigned tasks:", data.assignments);
            handleProductManagerTask(data.assignments.find(a => a.role === "Product Manager")?.task || "");
        }
    });

    // Product Manager analyzes requirements
    async function handleProductManagerTask(task: string) {
        const pmSession = await productManagerAgent.createSession("TeamLead", task);
        pmSession.onEvent((data: InferClassificationUnion<readonly ClassificationTypeConfig[]>) => {
            if (data.messageType === "REQUIREMENTS_ANALYSIS") {
                console.log("Product Manager has created user stories:", data.userStories);
                handleArchitectTask(JSON.stringify(data.userStories));
            }
        });
    }

    // Architect designs the system
    async function handleArchitectTask(userStories: string) {
        const architectSession = await architectAgent.createSession("ProductManager", userStories);
        architectSession.onEvent((data: InferClassificationUnion<readonly ClassificationTypeConfig[]>) => {
            if (data.messageType === "SYSTEM_DESIGN") {
                console.log("Architect has designed the system:", data.architecture);
                handleUIDesignerTask(JSON.stringify(data.architecture));
                handleBackendDevTask(JSON.stringify(data.architecture));
            }
        });
    }

    // UI Designer creates the design
    async function handleUIDesignerTask(architecture: string) {
        const uiDesignerSession = await uiDesignerAgent.createSession("Architect", architecture);
        uiDesignerSession.onEvent((data: InferClassificationUnion<readonly ClassificationTypeConfig[]>) => {
            if (data.messageType === "UI_DESIGN") {
                console.log("UI Designer has created the design:", data.design);
                handleFrontendDevTask(JSON.stringify(data.design));
            }
        });
    }

    // Frontend Developer implements the UI
    async function handleFrontendDevTask(design: string) {
        const frontendDevSession = await frontendDevAgent.createSession("UIDesigner", design);
        frontendDevSession.onEvent((data: InferClassificationUnion<readonly ClassificationTypeConfig[]>) => {
            if (data.messageType === "FRONTEND_IMPLEMENTATION") {
                console.log("Frontend Developer has implemented:", data.implementation);
                saveFrontendCode(data.implementation);
                handleQATask("frontend", JSON.stringify(data.implementation));
            }
        });
    }

    // Backend Developer implements the backend
    async function handleBackendDevTask(architecture: string) {
        const backendDevSession = await backendDevAgent.createSession("Architect", architecture);
        backendDevSession.onEvent((data: InferClassificationUnion<readonly ClassificationTypeConfig[]>) => {
            if (data.messageType === "BACKEND_IMPLEMENTATION") {
                console.log("Backend Developer has implemented:", data.implementation);
                saveBackendCode(data.implementation);
                handleQATask("backend", JSON.stringify(data.implementation));
            }
        });
    }

    // QA Engineer creates and executes test plans
    async function handleQATask(component: string, implementation: string) {
        const qaSession = await qaEngineerAgent.createSession("Developer", `${component}: ${implementation}`);
        qaSession.onEvent((data: InferClassificationUnion<readonly ClassificationTypeConfig[]>) => {
            if (data.messageType === "TEST_PLAN") {
                console.log("QA Engineer has created test plan:", data.testPlan);
                saveTestPlan(data.testPlan);
                if (component === "backend") {
                    handleSystemEngineerTask(JSON.stringify(data.testPlan));
                }
            }
        });
    }

    // System Engineer plans and executes deployment
    async function handleSystemEngineerTask(testPlan: string) {
        const sysEngineerSession = await systemEngineerAgent.createSession("QAEngineer", testPlan);
        sysEngineerSession.onEvent((data: InferClassificationUnion<readonly ClassificationTypeConfig[]>) => {
            if (data.messageType === "DEPLOYMENT_PLAN") {
                console.log("System Engineer has created deployment plan:", data.deploymentPlan);
                saveDeploymentPlan(data.deploymentPlan);
                console.log("Software development process completed!");
            }
        });
    }

    // Helper functions to save artifacts
    function saveFrontendCode(implementation: any) {
        fs.writeFileSync(path.join(projectsDir, 'frontend_code.json'), JSON.stringify(implementation, null, 2));
    }

    function saveBackendCode(implementation: any) {
        fs.writeFileSync(path.join(projectsDir, 'backend_code.json'), JSON.stringify(implementation, null, 2));
    }

    function saveTestPlan(testPlan: any) {
        fs.writeFileSync(path.join(projectsDir, 'test_plan.json'), JSON.stringify(testPlan, null, 2));
    }

    function saveDeploymentPlan(deploymentPlan: any) {
        fs.writeFileSync(path.join(projectsDir, 'deployment_plan.json'), JSON.stringify(deploymentPlan, null, 2));
    }
}

// Run the main program
main().catch(console.error);