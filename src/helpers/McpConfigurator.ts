/**
 * MCP configuration utilities for loading tools from a config file
 */

import { McpTool } from "../tools/mcpTool.js";
import { McpClient } from "../mcp/client.js";
import { McpConnectionParams, McpConnector } from "../mcp/connection.js";
import { createRuntime } from "../runtime/index.js";
import { Runtime } from "../runtime/types.js";
import { logger } from "../core/Logger.js";
import { mcpLoggers } from "../mcp/logging.js";
import { McpToolsHelper } from "../mcp/tools.js";

/**
 * Configuration for an MCP server
 */
export interface McpServerConfig {
  command?: string;
  args?: string[];
  cwd?: string;
  url?: string;
  type?: "http" | "sse";
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
 * Configuration for multiple MCP servers
 */
export interface McpServersConfig {
  mcpServers: Record<string, McpServerConfig>;
}

/**
 * Helper class for loading MCP tools from configuration
 */
export class McpConfigurator {
  private static runtime: Runtime = createRuntime();
  
  /**
   * Creates MCP clients from the configuration and returns all individual tools
   * @param configPath Path to the mcp_config.json file (or explicit path if provided)
   * @returns Promise that resolves to an array of McpTool instances for all tools from all servers
   */
  public static async loadTools(configPath?: string): Promise<McpTool[]> {
    const configLogger = mcpLoggers.tools;
    try {
      // Default to mcp_config.json in current directory if no path provided
      const targetPath = configPath || './mcp_config.json' || './conf/mcp_config.json';
      
      configLogger.debug(`Loading MCP config from: ${targetPath}`);
      console.log(`📋 MCP CONFIGURATOR: Loading config from ${targetPath}`);
      
      // Check if file exists before attempting to read
      const exists = await this.runtime.fs.exists(targetPath);
      if (!exists) {
        configLogger.warn(`MCP config file not found: ${targetPath}`);
        console.log(`⚠️ MCP CONFIGURATOR: Config file not found: ${targetPath}`);
        return [];
      }
      
      const configContent = await this.runtime.fs.readFile(targetPath, 'utf8');
      
      // Parse JSON with better error handling
      let config: McpServersConfig;
      try {
        config = JSON.parse(configContent) as McpServersConfig;
      } catch (parseError) {
        logger.warning(`Failed to parse MCP config file: ${targetPath}`, parseError);
        console.log(`❌ MCP CONFIGURATOR: Failed to parse config file: ${targetPath}`);
        return [];
      }
      
      if (!config.mcpServers) {
        logger.info("No mcpServers found in config");
        console.log(`ℹ️ MCP CONFIGURATOR: No mcpServers found in config`);
        return [];
      }
      
      console.log(`🔍 MCP CONFIGURATOR: Found ${Object.keys(config.mcpServers).length} server(s) in config: ${Object.keys(config.mcpServers).join(', ')}`);
      
      const allTools: McpTool[] = [];
      
      // For each server in the configuration, connect and get tools
      for (const [serverName, serverConfig] of Object.entries(config.mcpServers)) {
        try {
          // Determine the server type
          let serverType: "http" | "sse" | "stdio";
          
          if (serverConfig.url) {
            serverType = serverConfig.type === "sse" ? "sse" : "http";
          } else if (serverConfig.command) {
            serverType = "stdio";
          } else {
            logger.warning(`Invalid configuration for MCP server ${serverName}, skipping`);
            console.log(`⚠️ MCP CONFIGURATOR: Invalid configuration for server ${serverName}, skipping`);
            continue;
          }
          
          // Create connection parameters
          const connectionParams: McpConnectionParams = {
            serverType,
            url: serverConfig.url,
            command: serverConfig.command,
            args: serverConfig.args,
            cwd: serverConfig.cwd,
            env: serverConfig.env,
            timeout: serverConfig.timeout,
            auth: serverConfig.auth
          };
          
          // Connect to the MCP server
          configLogger.info(`Connecting to MCP server: ${serverName}`);
          console.log(`🔌 MCP CONFIGURATOR: Connecting to server: ${serverName} (${serverType})`);
          if (serverType === "stdio") {
            console.log(`🔌 MCP CONFIGURATOR: Command: ${serverConfig.command} ${serverConfig.args?.join(' ') || ''}`);
          } else {
            console.log(`🔌 MCP CONFIGURATOR: URL: ${serverConfig.url}`);
          }
          
          const mcpClient = await McpConnector.connect(connectionParams);
          
          // Run diagnostics on the MCP server if no tools are found
          const serverTools = await McpToolsHelper.listTools(mcpClient, serverName);
          
          if (serverTools.length === 0) {
            // If no tools found, run diagnostics to help identify the problem
            configLogger.warn(`No tools found on ${serverName}, running diagnostics...`);
            console.log(`⚠️ MCP CONFIGURATOR: No tools found on ${serverName}, running diagnostics...`);
            await McpToolsHelper.diagnoseToolDiscovery(mcpClient, serverName);
            
            // Try a direct request to see what's available
            try {
              // @ts-ignore - Accessing private client property for diagnostic purposes
              const rawClient = mcpClient['client'];
              if (rawClient && typeof rawClient.sendRequest === 'function') {
                configLogger.debug(`Attempting raw listTools request on ${serverName}...`);
                console.log(`🔍 MCP CONFIGURATOR: Attempting raw listTools request on ${serverName}...`);
                const rawResponse = await rawClient.sendRequest('listTools', {});
                configLogger.debug(`Raw listTools response: ${JSON.stringify(rawResponse)}`);
                console.log(`🔍 MCP CONFIGURATOR: Raw listTools response: ${JSON.stringify(rawResponse, null, 2)}`);
              }
            } catch (diagError) {
              configLogger.warn(`Diagnostic request failed: ${diagError instanceof Error ? diagError.message : String(diagError)}`);
              console.log(`❌ MCP CONFIGURATOR: Diagnostic request failed: ${diagError instanceof Error ? diagError.message : String(diagError)}`);
            }
            
            continue; // Skip to next server if no tools found
          }
          
          console.log(`✅ MCP CONFIGURATOR: Found ${serverTools.length} tools on ${serverName}: ${serverTools.map(t => t.name).join(', ')}`);
          
          // Create an McpTool instance for each tool on the server
          for (const tool of serverTools) {
            configLogger.debug(`Creating McpTool for ${tool.name}`);
            allTools.push(new McpTool(
              mcpClient,
              tool.name,
              tool.description || `Tool '${tool.name}' from ${serverName} MCP server`,
              tool.inputSchema,
              tool.outputSchema
            ));
          }
        } catch (error: any) {
          // Don't let failures on one server affect others
          logger.warning(`Error connecting to MCP server ${serverName}: ${error.message}`);
          console.log(`❌ MCP CONFIGURATOR: Error connecting to server ${serverName}: ${error.message}`);
        }
      }
      
      if (allTools.length > 0) {
        logger.info(`Successfully loaded ${allTools.length} MCP tools from all servers`);
        console.log(`✅ MCP CONFIGURATOR: Successfully loaded ${allTools.length} MCP tools from all servers`);
      } else {
        logger.warning("No tools found across all MCP servers");
        console.log(`⚠️ MCP CONFIGURATOR: No tools found across all MCP servers`);
      }
      
      return allTools;
    } catch (error: any) {
      // Provide detailed error information for debugging
      configLogger.error(`Error loading MCP tools: ${error instanceof Error ? error.stack || error.message : String(error)}`);
      logger.warning(`Non-fatal error loading MCP tools: ${error.message}`);
      console.log(`❌ MCP CONFIGURATOR: Error loading MCP tools: ${error.message}`);
      return [];
    }
  }
}
