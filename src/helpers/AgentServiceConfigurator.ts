import dotenv from "dotenv"; 
import { AgentServiceConfig } from "../core/configs";
import { createRuntime } from "../runtime";

/**
 * AgentServiceConfigurator is responsible for loading the agent service configuration from the environment file.
 * It supports loading from an environment file in the current working directory or from a custom path specified by the BASE_PATH environment variable.
 * The configuration file is expected to set the following environment variables:
 * - LLM_API_KEY: The API key for the large language model provider.
 * - LLM_PROVIDER_URL: The base URL for the large language model provider.
 * - LLM_MODEL: The model to use for the large language model.
 * - LLM_STREAM_MODE: Whether to use streaming mode for the large language model.
 */
export class AgentServiceConfigurator {
  private basePath?: string;
  private agentServiceConf: AgentServiceConfig = {};
  private runtime = createRuntime();

  private constructor(basePath: string) {
    this.basePath = basePath;
  } 

  private async expandTilde(path: string): Promise<string> {
    if (path.startsWith("~")) {
      const homeDir = await this.runtime.os.homedir();
      return this.runtime.path.join(homeDir, path.slice(1));
    }
    return path;
  }

  private async getEnvVar(name: string): Promise<string | undefined> {
    return this.runtime.process.env[name];
  }

  public static async getAgentConfiguration(basePath?: string, envFile: string = ".agent.env"): Promise<AgentServiceConfig> {
    // Create runtime instance for static context
    const runtime = createRuntime();
    
    // Use process.cwd() as default if basePath is not provided
    const configurator = new AgentServiceConfigurator(basePath || await runtime.process.cwd());
 
    // First read from shell environment variables
    configurator.agentServiceConf = {
      llmConfig: {
        apiKey: (await configurator.getEnvVar('LLM_API_KEY')) || '',
        baseURL: await configurator.getEnvVar('LLM_PROVIDER_URL'),
        model: (await configurator.getEnvVar('LLM_MODEL')) || "",
        streamMode: (await configurator.getEnvVar('LLM_STREAM_MODE')) === 'true'
      }
    };

    // Expand tilde to home directory if present
    if (configurator.basePath) {
      configurator.basePath = await configurator.expandTilde(configurator.basePath);
    }

    // Then try to load and override from env file if it exists
    const envPath = configurator.basePath && envFile
      ? configurator.runtime.path.join(configurator.basePath, envFile)
      : undefined;
    
    if (envPath && await configurator.runtime.fs.exists(envPath)) {
      dotenv.config({ path: envPath });

      // Override with values from env file
      configurator.agentServiceConf = {
        llmConfig: {
          apiKey: (await configurator.getEnvVar('LLM_API_KEY')) || configurator.agentServiceConf.llmConfig?.apiKey || '',
          baseURL: (await configurator.getEnvVar('LLM_PROVIDER_URL')) || configurator.agentServiceConf.llmConfig?.baseURL,
          model: (await configurator.getEnvVar('LLM_MODEL')) || configurator.agentServiceConf.llmConfig?.model || "",
          streamMode: (await configurator.getEnvVar('LLM_STREAM_MODE')) === 'true' || configurator.agentServiceConf.llmConfig?.streamMode || false
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
