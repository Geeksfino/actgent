import { Runtime, createRuntime } from "../runtime";

export interface LocalEnvironment {
  osType?: string; // OS type (e.g., 'Linux', 'Windows')
  outputDirectory: string; // Path where file-related operations should take place
  tempDirectory: string; // Path to temporary storage
  apiKeys?: Record<string, string>; // API keys for external services if needed
}

export interface ToolPreference {
  toolName: string; // Name of the tool
  customOptions?: Record<string, any>; // Additional options or flags for tool behavior
}

// Execution context passed to tools
export class ExecutionContext {
  environment: LocalEnvironment;
  toolPreferences: Map<string, ToolPreference>;
  private static instance: ExecutionContext;
  private runtime: Runtime;

  constructor() {
    this.runtime = createRuntime();
    // Initialize with empty paths - will be set properly by initEnvironment
    this.environment = {
      outputDirectory: '',
      tempDirectory: ''
    };
    this.toolPreferences = new Map<string, ToolPreference>();
    // Initialize environment synchronously with runtime APIs
    this.initEnvironmentSync();
  }

  public static getInstance(): ExecutionContext {
    if (!ExecutionContext.instance) {
      ExecutionContext.instance = new ExecutionContext();
    }
    return ExecutionContext.instance;
  }

  private initEnvironmentSync() {
    // Use runtime.process.env for immediate access to environment variables
    const homeDir = this.runtime.process.env.HOME || this.runtime.process.env.USERPROFILE || '';
    const tmpDir = this.runtime.process.env.TEMP || this.runtime.process.env.TMP || '/tmp';
    const platform = this.runtime.process.platform;

    const osType = platform === "win32" ? "Windows" 
                 : platform === "darwin" ? "MacOS" 
                 : "Linux";

    this.environment = {
      osType,
      outputDirectory: this.runtime.path.join(homeDir, "tools-output"),
      tempDirectory: this.runtime.path.join(tmpDir, "tools-temp"),
      apiKeys: {}
    };

    // Create directories asynchronously but don't block initialization
    this.ensureDirectories().catch(error => {
      console.error(`Error creating directories: ${error}`);
    });
  }

  private async ensureDirectories() {
    await this.runtime.fs.mkdir(this.environment.outputDirectory, { recursive: true });
    await this.runtime.fs.mkdir(this.environment.tempDirectory, { recursive: true });
  }

  public setEnvironment(env: Partial<LocalEnvironment>) {
    this.environment = { ...this.environment, ...env };
    // Ensure directories exist for new paths
    this.ensureDirectories().catch(error => {
      console.error(`Error creating directories after environment update: ${error}`);
    });
  }

  public addToolPreference(toolName: string, options?: Record<string, any>) {
    //console.log('Before setting:', this.toolPreferences);
    const preference: ToolPreference = {
      toolName: toolName,
      customOptions: options
    };
    this.toolPreferences.set(toolName, preference);
    // console.log('After setting:', this.toolPreferences);
    // console.log('Verification - getting value:', this.toolPreferences.get(toolName));
  }

  public getToolPreference(toolName: string): ToolPreference | undefined {
    const preference = this.toolPreferences.get(toolName);
    // console.log(`Getting tool preference for ${toolName}:`, preference);
    return preference;
  }

  public toJSON() {
    return {
      environment: this.environment,
      toolPreferences: Object.fromEntries(this.toolPreferences)
    };
  }
}