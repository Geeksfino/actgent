/**
 * MCP client implementation
 */

import { Logger } from "../core/Logger";
import { McpClientConfig, McpToolInfo, McpResourceInfo, McpPromptInfo, McpClientTransport } from "./types";
import { mcpLoggers } from "./logging";

/**
 * Client for interacting with MCP servers
 */
export class McpClient {
  private client: any; // Using any temporarily to avoid SDK type issues
  private transport: McpClientTransport;
  private logger: Logger;
  private connected: boolean = false;

  /**
   * Creates a new MCP client
   * @param config Client configuration
   * @param transport Transport implementation
   */
  constructor(config: McpClientConfig, transport: McpClientTransport) {
    this.logger = config.logger || mcpLoggers.client;
    this.transport = transport;
    
    // Import dynamically to avoid module resolution issues
    const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
    
    this.client = new Client(
      {
        name: config.name,
        version: config.version
      },
      {
        capabilities: config.capabilities || {
          prompts: {},
          resources: {},
          tools: {}
        }
      }
    );
  }

  /**
   * Connects to the MCP server
   * @returns Promise that resolves when connected
   */
  async connect(): Promise<void> {
    if (this.connected) return;
    
    try {
      await this.client.connect(this.transport);
      this.connected = true;
      this.logger.info("Connected to MCP server");
    } catch (error) {
      this.logger.error("Failed to connect to MCP server", error);
      throw error;
    }
  }

  /**
   * Disconnects from the MCP server
   * @returns Promise that resolves when disconnected
   */
  async disconnect(): Promise<void> {
    if (!this.connected) return;
    
    try {
      await this.client.disconnect();
      this.connected = false;
      this.logger.info("Disconnected from MCP server");
    } catch (error) {
      this.logger.error("Error disconnecting from MCP server", error);
      throw error;
    }
  }

  /**
   * Lists available tools from the MCP server
   * @returns Promise that resolves to an array of tool information
   */
  async listTools(): Promise<McpToolInfo[]> {
    try {
      this.ensureConnected();
      
      this.logger.debug('Calling listTools on MCP server...');
      const response = await this.client.listTools();
      this.logger.debug(`Raw listTools response: ${JSON.stringify(response)}`);
      
      // Handle different response formats based on protocol versions
      let tools: any[] = [];
      
      if (!response) {
        this.logger.warn('MCP server returned null/undefined for tools listing');
        return [];
      }
      
      // Handle array response (standard format)
      if (Array.isArray(response)) {
        tools = response;
      } 
      // Handle { tools: [] } format (some MCP servers wrap the array)
      else if (response.tools && Array.isArray(response.tools)) {
        tools = response.tools;
      }
      // Handle object with tool names as keys
      else if (typeof response === 'object' && !Array.isArray(response)) {
        this.logger.debug('Tools appear to be in object format, converting to array');
        tools = Object.entries(response).map(([name, data]: [string, any]) => ({
          name,
          ...data
        }));
      }
      
      if (tools.length === 0) {
        this.logger.warn('No tools found in the response');
      } else {
        this.logger.debug(`Found ${tools.length} tools from MCP server`);
      }
      
      return tools.map((tool: any) => ({
        name: tool.name || '',
        description: tool.description || '',
        inputSchema: tool.inputSchema || { type: 'object', properties: {} },
        outputSchema: tool.outputSchema
      }));
    } catch (error) {
      this.logger.error(`Error listing tools from MCP server: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  /**
   * Calls a tool on the MCP server
   * @param name Tool name
   * @param args Tool arguments
   * @returns Promise that resolves to the tool result
   */
  async callTool(name: string, args: Record<string, any>): Promise<any> {
    this.ensureConnected();
    return this.client.callTool({
      name,
      arguments: args
    });
  }

  /**
   * Lists available resources from the MCP server
   * @returns Promise that resolves to an array of resource information
   */
  async listResources(): Promise<McpResourceInfo[]> {
    this.ensureConnected();
    const resources = await this.client.listResources();
    
    if (!resources || !Array.isArray(resources)) {
      return [];
    }
    
    return resources.map((resource: any) => ({
      uri: resource.uri,
      description: resource.description
    }));
  }

  /**
   * Reads a resource from the MCP server
   * @param uri Resource URI
   * @returns Promise that resolves to the resource content
   */
  async readResource(uri: string): Promise<any> {
    this.ensureConnected();
    return this.client.readResource(uri);
  }

  /**
   * Lists available prompts from the MCP server
   * @returns Promise that resolves to an array of prompt information
   */
  async listPrompts(): Promise<McpPromptInfo[]> {
    this.ensureConnected();
    const prompts = await this.client.listPrompts();
    
    if (!prompts || !Array.isArray(prompts)) {
      return [];
    }
    
    return prompts.map((prompt: any) => ({
      name: prompt.name,
      description: prompt.description,
      arguments: prompt.arguments
    }));
  }

  /**
   * Gets a prompt from the MCP server
   * @param name Prompt name
   * @param args Prompt arguments
   * @returns Promise that resolves to the prompt content
   */
  async getPrompt(name: string, args?: Record<string, any>): Promise<any> {
    this.ensureConnected();
    return this.client.getPrompt(name, args);
  }

  /**
   * Checks if the client is connected and throws an error if not
   * @private
   */
  private ensureConnected(): void {
    if (!this.connected) {
      throw new Error("MCP client is not connected");
    }
  }
}
