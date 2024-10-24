import os from "os";
import path from "path";
import fs from "fs";

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
  environment: LocalEnvironment; // Environment-specific data
  toolPreferences: Map<string, ToolPreference>; // Changed from optional to required
  private static instance: ExecutionContext;

  constructor() {
    this.environment = ExecutionContext.initEnvironment();
    this.toolPreferences = new Map<string, ToolPreference>();
  }

  public static getInstance(): ExecutionContext {
    if (!ExecutionContext.instance) {
      ExecutionContext.instance = new ExecutionContext();
    }
    return ExecutionContext.instance;
  }

  private static initEnvironment(): LocalEnvironment {
    // Auto-detect OS
    const osType =
      os.platform() === "win32"
        ? "Windows"
        : os.platform() === "darwin"
          ? "MacOS"
          : "Linux";

    // Set up default directories based on OS
    const baseDir = os.homedir();
    const outputDirectory = path.join(baseDir, "tools-output");
    const tempDirectory = path.join(os.tmpdir(), "tools-temp");

    // Ensure directories exist
    try {
      fs.mkdirSync(outputDirectory, { recursive: true });
      fs.mkdirSync(tempDirectory, { recursive: true });
    } catch (error) {
      console.error(`Error creating directories: ${error}`);
    }

    return {
      osType,
      outputDirectory,
      tempDirectory,
      apiKeys: {}, // Initialize empty API keys object
    };
  }

  public addToolPreference(toolName: string, options?: Record<string, any>) {
    console.log('Before setting:', this.toolPreferences);
    const preference: ToolPreference = {
      toolName: toolName,
      customOptions: options
    };
    this.toolPreferences.set(toolName, preference);
    console.log('After setting:', this.toolPreferences);
    console.log('Verification - getting value:', this.toolPreferences.get(toolName));
  }

  public getToolPreference(toolName: string): ToolPreference | undefined {
    const preference = this.toolPreferences.get(toolName);
    console.log(`Getting tool preference for ${toolName}:`, preference);
    return preference;
  }

  public toJSON() {
    return {
      environment: this.environment,
      toolPreferences: Object.fromEntries(this.toolPreferences)
    };
  }
}
