/**
 * MCP transport implementations for different connection methods
 */

import { McpClientTransport } from './types';

/**
 * Configuration for stdio transport
 */
export interface StdioTransportConfig {
  /** Command to execute */
  command: string;
  
  /** Command arguments */
  args: string[];
}

/**
 * Configuration for HTTP transport
 */
export interface HttpTransportConfig {
  /** Server URL */
  url: string;
  
  /** Optional HTTP headers */
  headers?: Record<string, string>;
}

/**
 * Creates a stdio transport for MCP
 * @param config Stdio transport configuration
 * @returns Stdio client transport instance
 */
export function createStdioTransport(config: StdioTransportConfig): McpClientTransport {
  // Import dynamically to avoid potential module resolution issues
  const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
  
  return new StdioClientTransport({
    command: config.command,
    args: config.args
  });
}

/**
 * Creates an HTTP transport for MCP
 * @param config HTTP transport configuration
 * @returns HTTP client transport instance
 */
export function createHttpTransport(config: HttpTransportConfig): McpClientTransport {
  // Import dynamically to avoid potential module resolution issues
  const { HttpClientTransport } = require('@modelcontextprotocol/sdk/client/http.js');
  
  return new HttpClientTransport({
    url: config.url,
    headers: config.headers
  });
}
