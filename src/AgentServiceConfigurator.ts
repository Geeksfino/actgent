import dotenv from "dotenv"; // Import dotenv
import fs from "fs";
import path from "path";
import os from "os";
import { AgentServiceConfig } from "./interfaces";

/**
 * AgentServiceConfigurator is responsible for loading the agent service configuration from the environment file.
 * It supports loading from an environment file in the current working directory or from a custom path specified by the BASE_PATH environment variable.
 * The configuration file is expected to set the following environment variables:
 * - LLM_API_KEY: The API key for the large language model provider.
 * - LLM_PROVIDER_URL: The base URL for the large language model provider.
 * - LLM_MODEL: The model to use for the large language model.
 * - LLM_STREAM_MODE: Whether to use streaming mode for the large language model.
 * 
 */
export class AgentServiceConfigurator {
  private basePath?: string;
  private agentServiceConf: AgentServiceConfig = {};

  private constructor(basePath: string) {
    this.basePath = basePath;
    console.log("base path: " + this.basePath);
  } 

  public static getAgentConfiguration(basePath?: string, envFile: string = ".agent.env"): AgentServiceConfig {
    // Use process.cwd() as default if basePath is not provided
    const actualBasePath = basePath || process.cwd();
    const configurator = new AgentServiceConfigurator(actualBasePath);

    // Expand tilde to home directory if present
    if (configurator.basePath?.startsWith("~")) {
      configurator.basePath = path.join(os.homedir(), configurator.basePath.slice(1));
    }

    const envPath = configurator.basePath && envFile
      ? path.join(configurator.basePath, envFile)
      : undefined;
    if (envPath && fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
      console.log(`Agent service configuration loaded from ${envPath}`);

      configurator.agentServiceConf = {
        llmConfig: {
          apiKey: process.env.LLM_API_KEY || '',
          baseURL: process.env.LLM_PROVIDER_URL,
          model: process.env.LLM_MODEL || "",
          streamMode: process.env.LLM_STREAM_MODE === 'true'
        }
      };
    } else {
      console.warn(`Environment file not found at ${envPath}. Using default or existing environment variables.`);
    }

    return configurator.agentServiceConf;
  }
}
