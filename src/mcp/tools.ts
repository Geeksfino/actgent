import { mcpLoggers } from './logging';
import { McpClient } from './client';
import { McpToolInfo } from './types';

/**
 * Enhanced tools discovery and debugging for MCP servers
 */
export class McpToolsHelper {
  private static logger = mcpLoggers.tools;

  /**
   * Lists tools from an MCP server with enhanced error handling and debugging
   * @param client Connected MCP client
   * @param serverName Optional server name for logging
   * @returns Promise resolving to array of tool information
   */
  public static async listTools(client: McpClient, serverName?: string): Promise<McpToolInfo[]> {
    try {
      this.logger.debug(`Listing tools from MCP server${serverName ? `: ${serverName}` : ''}`);
      
      const tools = await client.listTools();
      
      if (tools.length === 0) {
        this.logger.warn(`No tools found on MCP server${serverName ? `: ${serverName}` : ''}`);
      } else {
        this.logger.info(`Found ${tools.length} tools on MCP server${serverName ? `: ${serverName}` : ''}`);
        
        // Log detailed information about each tool
        tools.forEach((tool, index) => {
          this.logger.debug(`Tool ${index + 1}: ${tool.name}`);
          this.logger.debug(`  Description: ${tool.description || '(no description)'}`);
          this.logger.debug(`  Input Schema: ${JSON.stringify(tool.inputSchema || {})}`);
          this.logger.debug(`  Output Schema: ${JSON.stringify(tool.outputSchema || {})}`);
        });
      }
      
      return tools;
    } catch (error) {
      this.logger.error(`Error listing tools from MCP server${serverName ? ` ${serverName}` : ''}: ${
        error instanceof Error ? error.message : String(error)
      }`);
      return [];
    }
  }

  /**
   * Diagnoses potential issues with MCP tool discovery
   * @param client Connected MCP client
   * @param serverName Server name for logging
   */
  public static async diagnoseToolDiscovery(client: McpClient, serverName: string): Promise<void> {
    try {
      this.logger.info(`Diagnosing tool discovery issues for server: ${serverName}`);
      
      // Check server capabilities
      this.logger.debug(`Checking server capabilities for ${serverName}...`);
      
      // Attempt to use raw client methods to get more information
      try {
        // @ts-ignore - Accessing private client property for diagnostic purposes
        const rawClient = client['client'];
        if (rawClient) {
          const capabilities = await rawClient.getCapabilities();
          this.logger.debug(`Server capabilities: ${JSON.stringify(capabilities)}`);
          
          if (capabilities && capabilities.tools) {
            this.logger.debug(`Tools capability present: ${JSON.stringify(capabilities.tools)}`);
          } else {
            this.logger.warn(`Server ${serverName} does not support tools capability`);
          }
        }
      } catch (err) {
        this.logger.debug(`Could not access raw capabilities: ${err instanceof Error ? err.message : String(err)}`);
      }
    } catch (error) {
      this.logger.error(`Error diagnosing MCP server ${serverName}: ${
        error instanceof Error ? error.message : String(error)
      }`);
    }
  }
}
