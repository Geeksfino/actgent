import {
  InferClassificationUnion,
  ClassificationTypeConfig,
  Session,
} from "@finogeeks/actgent";
import fs from "fs";
import path from "path";
import readline from "readline";
import os from "os";
import { deserializeMiniProgram } from "./utils";
// Import all agents
// import { projectManagerAgent } from './agents/ProjectManagerAgent';
// import { productManagerAgent } from './agents/ProductManagerAgent';
import { specWriterAgent } from "./agents/SpecWriterAgent";
// import { architectAgent } from './agents/ArchitectAgent';
// import { uiDesignerAgent } from './agents/UIDesignerAgent';
import { frontendDevAgent } from './agents/FrontendDevAgent';
// import { backendDevAgent } from './agents/BackendDevAgent';
// import { qaEngineerAgent } from './agents/QAEngineerAgent';
// import { systemEngineerAgent } from './agents/SystemEngineerAgent';
// import { techWriterAgent } from './agents/TechWriterAgent';

// Add this import
import { LoggingConfig } from "../../src/interfaces";

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Function to get user input
async function getUserInput(prompt: string): Promise<string> {
  while (true) {
    const answer = await new Promise<string>((resolve) => {
      rl.question(prompt, (answer) => {
        resolve(answer.trim());
      });
    });

    if (answer === '/exit') {
      console.log("Exiting the program.");
      process.exit(0);
    }

    if (answer !== "") {
      return answer;
    }

    // If the answer is empty, just print the prompt again
    process.stdout.write(">");
  }
}

// Function to expand tilde in path
function expandTilde(filePath: string): string {
  if (filePath[0] === "~") {
    return path.join(os.homedir(), filePath.slice(1));
  }
  return filePath;
}

async function orchestrateWorkflow(desc: string, projectDir: string) {
  console.log("Starting the software development process...");

  // Step 1: Product Manager creates functional specification
  const swSession = await specWriterAgent.createSession("Orchestrator", desc);

  const functionalSpec = await new Promise<any>((resolve) => {
    swSession.onEvent((data) => {
      //console.log("Received event:", data);
      if (data.messageType === "SPEC_DESIGN") {
        resolve(data.spec);
      } else if (data.messageType === "CLARIFICATION_NEEDED") {
        //console.log("Clarification needed:", data.questions);
        promptForClarification(data.questions, swSession).then(resolve);
      }
    });
  });
  console.log("Functional specification created:", JSON.stringify(functionalSpec, null, 2));

  //   // Step 2: UI Designer creates wireframes and UX design
  //   const uiDesignerSession = await uiDesignerAgent.createSession("ProductManager", JSON.stringify(functionalSpec));
  //   const uiDesign = await new Promise<any>((resolve) => {
  //     uiDesignerSession.onEvent((data) => {
  //       if (data.messageType === "UI_DESIGN") {
  //         resolve(data.design);
  //       }
  //     });
  //   });

  //   // Step 3: Architect designs the system
  //   const architectSession = await architectAgent.createSession("ProductManager", JSON.stringify(functionalSpec));
  //   const systemDesign = await new Promise<any>((resolve) => {
  //     architectSession.onEvent((data) => {
  //       if (data.messageType === "SYSTEM_DESIGN") {
  //         resolve(data.architecture);
  //       }
  //     });
  //   });

  //   // Step 4: Project Manager creates project delivery plan
  //   const projectManagerSession = await projectManagerAgent.createSession("Orchestrator", JSON.stringify({ functionalSpec, uiDesign, systemDesign }));
  //   const projectPlan = await new Promise<any>((resolve) => {
  //     projectManagerSession.onEvent((data) => {
  //       if (data.messageType === "PROJECT_PLAN") {
  //         resolve(data.plan);
  //       }
  //     });
  //   });

  //   // Step 5: Frontend and Backend Development
    const frontendSession = await frontendDevAgent.createSession("Orchestrator", JSON.stringify(functionalSpec, null, 2));
  //   const backendSession = await backendDevAgent.createSession("ProjectManager", JSON.stringify({ projectPlan: projectPlan.backendTasks, systemDesign }));

    const miniProgramProject = await new Promise<any>((resolve) => {
      frontendSession.onEvent((data) => {
          if (data.messageType === "MINIPROGRAM_CODE_GENERATION") {
            resolve(data.generatedCode);
          }
      });
    });
    console.log("Mini-program project generated:", miniProgramProject);
    deserializeMiniProgram(JSON.stringify(miniProgramProject), projectDir);

  //     new Promise<any>((resolve) => {
  //       backendSession.onEvent((data) => {
  //         if (data.messageType === "BACKEND_IMPLEMENTATION") {
  //           resolve(data.implementation);
  //         }
  //       });
  //     })
  //   ]);

  //   // Step 6: QA Testing
  //   const qaSession = await qaEngineerAgent.createSession("ProjectManager", JSON.stringify({ frontendImplementation, backendImplementation, projectPlan: projectPlan.testingTasks }));
  //   const testResults = await new Promise<any>((resolve) => {
  //     qaSession.onEvent((data) => {
  //       if (data.messageType === "TEST_RESULTS") {
  //         resolve(data.results);
  //       }
  //     });
  //   });
  //   console.log("Test results:", testResults);

  //   // Step 7: System Engineer deploys the project
  //   const sysEngineerSession = await systemEngineerAgent.createSession("ProjectManager", JSON.stringify({ frontendImplementation, backendImplementation, testResults, projectPlan: projectPlan.deploymentTasks }));
  //   const deploymentResult = await new Promise<any>((resolve) => {
  //     sysEngineerSession.onEvent((data) => {
  //       if (data.messageType === "DEPLOYMENT_RESULT") {
  //         resolve(data.result);
  //       }
  //     });
  //   });

  //   // Step 8: Project Manager reviews and concludes the project
  //   const projectReviewSession = await projectManagerAgent.createSession("Orchestrator", JSON.stringify({ projectPlan, testResults, deploymentResult }));
  //   const projectConclusion = await new Promise<any>((resolve) => {
  //     projectReviewSession.onEvent((data) => {
  //       if (data.messageType === "PROJECT_CONCLUSION") {
  //         resolve(data.conclusion);
  //       }
  //     });
  //   });

  console.log("Software development process completed!");
  return {
    functionalSpec,
    // uiDesign,
    // systemDesign,
    // projectPlan,
    // frontendImplementation,
    // backendImplementation,
    // testResults,
    // deploymentResult,
    // projectConclusion
  };
}

async function promptForClarification(
  questions: string[],
  session: Session
): Promise<any> {
  const answer = await getUserInput(
    "Please provide clarification for the following questions:\n" +
    questions.join("\n") +
    "\n\n>"
  );

  await session.chat(answer);
  return new Promise<any>((resolve) => {
    session.onEvent((data) => {
      if (data.messageType === "SPEC_DESIGN") {
        resolve(data.spec);
      } else if (data.messageType === "CLARIFICATION_NEEDED") {
        console.log("Additional clarification needed:", data.questions);
        promptForClarification(data.questions, session).then(resolve);
      }
    });
  });
}

// Main program
async function main() {
  if (process.argv.length < 4) {
    console.error(
      "Usage: bun run test/multi-agents/team.js <workarea_directory> <project_name>"
    );
    console.error(
      "Example: bun run test/multi-agents/team.js ~/workarea myproject"
    );
    process.exit(1);
  }

  const baseDir = process.cwd();
  const workareaDir = expandTilde(process.argv[2]);
  const projectName = process.argv[3];
  const projectDir = path.join(workareaDir, projectName);
  // Ensure workarea directory exists
  if (!fs.existsSync(projectDir)) {
    console.log(`Creating project directory: ${projectDir}`);
    fs.mkdirSync(projectDir, { recursive: true });
  }

  console.log("Starting the software development process...");

  // Run all agents
  const agents = [
    specWriterAgent,
    // projectManagerAgent,
    // productManagerAgent,
    // architectAgent,
    // uiDesignerAgent,
    frontendDevAgent,
    // backendDevAgent,
    // qaEngineerAgent,
    // systemEngineerAgent,
    // techWriterAgent  // Add this line
  ];

  for (const agent of agents) {
    const logFile = path.join(workareaDir, `${agent.getName()}.log`);

    // Create a loggingConfig for each agent
    const loggingConfig: LoggingConfig = {
      destination: logFile,
    };

    // Pass the loggingConfig to the agent's run method
    await agent.run(loggingConfig);

    agent.registerStreamCallback((delta: string) => {
      //fs.appendFileSync(logFile, `${delta}\n`);
      console.log(`${agent.getName()} output:`, delta);
    });
  }

  try {
    const desc = await getUserInput("Please enter the project description: ");
    const result = await orchestrateWorkflow(desc, projectDir);
    console.log("Project completed successfully:", result);
  } catch (error) {
    console.error("An error occurred during the development process:", error);
  } finally {
    rl.close();
    process.exit(0);
  }
}

// Run the main program
main().catch((error) => {
  console.error("An unhandled error occurred:", error);
  process.exit(1);
});
