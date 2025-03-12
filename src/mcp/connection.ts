/**
 * MCP connection helper for actgent
 * Provides utilities for creating MCP client connections
 */

import { McpClient } from "./client.js";
import { createHttpTransport, createStdioTransport } from "./transport.js";

/**
 * Connection parameters for MCP servers
 */
export interface McpConnectionParams {
  serverType: "http" | "stdio";
  url?: string;
  command?: string;
  args?: string[];
  cwd?: string;
}

/**
 * Helper to create and connect to MCP servers
 */
export class McpConnector {
  /**
   * Creates and connects to an MCP server
   * @param params Connection parameters
   * @returns The connected MCP client
   */
  public static async connect(params: McpConnectionParams): Promise<McpClient> {
    const { serverType, url, command, args } = params;
    
    let client: McpClient;
    
    if (serverType === "http") {
      if (!url) {
        throw new Error("URL is required for HTTP transport");
      }
      
      const transport = createHttpTransport({ url });
      client = new McpClient({
        name: "ActgentMcpClient",
        version: "1.0.0"
      }, transport);
    } else if (serverType === "stdio") {
      if (!command) {
        throw new Error("Command is required for stdio transport");
      }
      
      const transport = createStdioTransport({
        command,
        args: args || []
      });
      
      client = new McpClient({
        name: "ActgentMcpClient",
        version: "1.0.0"
      }, transport);
    } else {
      throw new Error("Invalid server type");
    }
    
    await client.connect();
    return client;
  }
}
