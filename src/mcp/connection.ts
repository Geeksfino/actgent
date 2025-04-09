/**
 * MCP connection helper for actgent
 * Provides utilities for creating MCP client connections
 */

import { McpClient } from "./client.js";
import { createHttpTransport, createStdioTransport, createSseTransport } from "./transport.js";

/**
 * Connection parameters for MCP servers
 */
export interface McpConnectionParams {
  serverType: "http" | "sse" | "stdio";
  url?: string;
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  auth?: {
    method: "bearer" | "basic" | "oauth";
    token?: string;
    username?: string;
    password?: string;
    clientId?: string;
    clientSecret?: string;
    redirectUri?: string;
    callbackPort?: number;
    authTimeout?: number;
  };
}

/**
 * Helper to create and connect to MCP servers
 */
export class McpConnector {
  /**
   * Creates and connects to an MCP server
   * @param params Connection parameters
   * @param serverName Optional name for the server
   * @returns The connected MCP client
   */
  public static async connect(params: McpConnectionParams, serverName?: string): Promise<McpClient> {
    const { serverType, url, command, args, cwd, env, timeout, auth } = params;
    
    // Use provided server name or generate one based on connection type
    const clientName = serverName || 
      (serverType === "http" ? `HttpMcp-${url?.split("//")[1]?.split("/")[0] || "unknown"}` : 
       serverType === "sse" ? `SseMcp-${url?.split("//")[1]?.split("/")[0] || "unknown"}` : 
       `StdioMcp-${command || "unknown"}`);
    
    let client: McpClient;
    
    if (serverType === "http") {
      if (!url) {
        throw new Error("URL is required for HTTP transport");
      }
      
      const transport = createHttpTransport({ 
        url,
        auth
      });
      client = new McpClient({
        name: clientName,
        version: "1.0.0"
      }, transport);
    } else if (serverType === "sse") {
      if (!url) {
        throw new Error("URL is required for SSE transport");
      }
      
      const transport = createSseTransport({
        url,
        auth
      });
      
      client = new McpClient({
        name: clientName,
        version: "1.0.0"
      }, transport);
    } else if (serverType === "stdio") {
      if (!command) {
        throw new Error("Command is required for stdio transport");
      }
      
      const transport = createStdioTransport({
        command,
        args: args || [],
        cwd,
        env,
        timeout,
        auth: auth ? {
          callbackPort: auth.callbackPort,
          authTimeout: auth.authTimeout
        } : undefined
      });
      
      client = new McpClient({
        name: clientName,
        version: "1.0.0"
      }, transport);
    } else {
      throw new Error("Invalid server type");
    }
    
    await client.connect();
    return client;
  }
}
