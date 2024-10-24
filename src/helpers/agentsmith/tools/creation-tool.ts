import { Tool } from "../../../core/interfaces";
import { ExecutionContext } from "../../../core/ExecutionContext";
import { AgentScaffoldOptions, generateAgentScaffold } from "./scaffold-generator";

export class AgentGenerator implements Tool {
  public name: string;
  public description: string;

  constructor() {
    this.name = "AgentGenerator";
    this.description = "Generate an agent based on the input description";
  }

  public async execute(context: ExecutionContext, obj: any): Promise<any> {
    console.log("CreationTool executed:\n");
    const output = context.environment.outputDirectory;
    console.log(`Tool output directory: ${output}`);
    console.log(`Tool agent name: ${context.toolPreferences?.get("AgentGenerator")?.customOptions?.agentName}`);

    const options: AgentScaffoldOptions = {
      name: context.toolPreferences?.get("AgentGenerator")?.customOptions?.agentName,
      outputDir: output
    };
    const agentDir = await generateAgentScaffold(options);
    console.log(`Agent scaffold generated in: ${agentDir}`);

    return obj;
  }
}
