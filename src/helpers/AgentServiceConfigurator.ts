import dotenv from "dotenv"; 
import fs from "fs";
import path from "path";
import os from "os";
import { AgentServiceConfig } from "../core/interfaces";

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
    //console.log("base path: " + this.basePath);
  } 

  public static getAgentConfiguration(basePath?: string, envFile: string = ".agent.env"): AgentServiceConfig {
    // Use process.cwd() as default if basePath is not provided
    const actualBasePath = basePath || process.cwd();
    const configurator = new AgentServiceConfigurator(actualBasePath);
 
    // First read from shell environment variables
    configurator.agentServiceConf = {
      llmConfig: {
        apiKey: process.env.LLM_API_KEY || '',
        baseURL: process.env.LLM_PROVIDER_URL,
        model: process.env.LLM_MODEL || "",
        streamMode: process.env.LLM_STREAM_MODE === 'true'
      }
    };

    // Expand tilde to home directory if present
    if (configurator.basePath?.startsWith("~")) {
      configurator.basePath = path.join(os.homedir(), configurator.basePath.slice(1));
    }

    // Then try to load and override from env file if it exists
    const envPath = configurator.basePath && envFile
      ? path.join(configurator.basePath, envFile)
      : undefined;
    if (envPath && fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
      //console.log(`Agent service configuration loaded from ${envPath}`);

      // Override with values from env file
      configurator.agentServiceConf = {
        llmConfig: {
          apiKey: process.env.LLM_API_KEY || configurator.agentServiceConf.llmConfig?.apiKey || '',
          baseURL: process.env.LLM_PROVIDER_URL || configurator.agentServiceConf.llmConfig?.baseURL,
          model: process.env.LLM_MODEL || configurator.agentServiceConf.llmConfig?.model || "",
          streamMode: process.env.LLM_STREAM_MODE === 'true' || configurator.agentServiceConf.llmConfig?.streamMode || false
        }
      };
    } else {
      console.warn(`Environment file not found at ${envPath}. Using shell environment variables.`);
    }

    // Add validation checks after final configuration is set
    if (!configurator.agentServiceConf.llmConfig?.baseURL) {
      throw new Error("LLM_PROVIDER_URL is required but not set");
    }

    if (!configurator.agentServiceConf.llmConfig?.model) {
      throw new Error("LLM_MODEL is required but not set");
    }

    if (!configurator.agentServiceConf.llmConfig?.apiKey) {
      console.warn("Warning: LLM_API_KEY is not set (API key is possibly optional if using a local LLM provider)");
    }

    return configurator.agentServiceConf;
  }
}
