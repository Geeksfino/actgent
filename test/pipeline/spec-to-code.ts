import { ClassificationTypeConfig, InferClassificationUnion, AgentServiceConfigurator } from '@finogeeks/actgent';
import { SpecWriterAgent } from './SpecWriterAgent';
import { frontendDevAgent } from './FrontendDevAgent';
import { generateMiniProgram } from '../multi-agents/code_parser';
import fs from 'fs';
import path from 'path';
import os from 'os';

function expandTilde(filePath: string): string {
    if (filePath[0] === "~") {
      return path.join(os.homedir(), filePath.slice(1));
    }
    return filePath;
  }

// Check for command-line arguments
if (process.argv.length < 5) {
  console.error("Usage: bun run actgent/test/pipeline/spec-to-code.ts <workarea_directory> <project_name> <prompt>");
  console.error("Example: bun run actgent/test/pipeline/spec-to-code.ts ~/workarea myproject \"Create a stock chart mini-program\"");
  process.exit(1);
}

function deserializeMiniProgram(inputJson: string, outputDir: string) {

    if (fs.existsSync(outputDir)) {
        fs.rmdirSync(outputDir, { recursive: true });
    }

    // Call the function to generate the mini-program
    generateMiniProgram(inputJson, outputDir);
}

const prompt = process.argv[4];

const baseDir = process.cwd();
const workareaDir = expandTilde(process.argv[2]);
const projectName = process.argv[3];
const projectDir = path.join(workareaDir, projectName);
// Ensure workarea directory exists
if (!fs.existsSync(projectDir)) {
  console.log(`Creating project directory: ${projectDir}`);
  fs.mkdirSync(projectDir, { recursive: true });
}

const svcConfig = AgentServiceConfigurator.getAgentConfiguration("test/pipeline");

const specWriterAgent = new SpecWriterAgent(svcConfig);
specWriterAgent.registerStreamCallback((delta: string) => {
  console.log(delta);
});
specWriterAgent.run();

frontendDevAgent.registerStreamCallback((delta: string) => {
  console.log(delta);
});
frontendDevAgent.run();

const enhancedPrompt = await specWriterAgent.enhancePrompt(prompt);

const specSession = await specWriterAgent.createSession("owner", enhancedPrompt);
const resolvedSpec = await new Promise<InferClassificationUnion<readonly ClassificationTypeConfig[]>>((resolve, reject) => {
    specSession.onEvent(data => {
        if (data.messageType === 'SPEC_DESIGN') {
            resolve(data as InferClassificationUnion<readonly ClassificationTypeConfig[]>);
        } else if (data.messageType === 'ERROR') {
            reject(new Error(data.message));
            process.exit(1);
        } else {
            console.log(`Received unexpected message type: ${data.messageType}`);
            process.exit(1);
        }
    });
});
const spec = JSON.stringify(resolvedSpec.spec, null, 2);
console.log("---------- Spec generated ----------\n", spec);

const codeSession = await frontendDevAgent.createSession("owner", spec);
const resolvedCode = await new Promise<InferClassificationUnion<readonly ClassificationTypeConfig[]>>((resolve) => {
    codeSession.onEvent(data => resolve(data as InferClassificationUnion<readonly ClassificationTypeConfig[]>));
});
const generatedCode = JSON.stringify(JSON.parse(resolvedCode.content.result).generatedCode, null, 2);
console.log("---------- Code generated ----------\n", generatedCode);

//deserializeMiniProgram(generatedCode, projectDir);
frontendDevAgent.getTool("CREATE_MINIPROGRAM")?.execute(generatedCode, projectDir);
