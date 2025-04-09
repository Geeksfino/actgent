/**
 * MCP transport implementations for different connection methods
 */

import { McpClientTransport } from './types';
import { URL } from 'url';

/**
 * Configuration for stdio transport
 */
export interface StdioTransportConfig {
  /** Command to execute */
  command: string;
  
  /** Command arguments */
  args: string[];
  
  /** Working directory */
  cwd?: string;
  
  /** Environment variables */
  env?: Record<string, string>;
  
  /** Connection timeout in milliseconds */
  timeout?: number;
  
  /** Authentication configuration */
  auth?: {
    /** Local port for OAuth callback server */
    callbackPort?: number;
    /** Wait for authentication timeout */
    authTimeout?: number;
  };
}

/**
 * Configuration for HTTP transport
 */
export interface HttpTransportConfig {
  /** Server URL */
  url: string;
  
  /** Optional HTTP headers */
  headers?: Record<string, string>;
  
  /** Authentication configuration */
  auth?: {
    method: "bearer" | "basic" | "oauth";
    token?: string;
    username?: string;
    password?: string;
    clientId?: string;
    clientSecret?: string;
    redirectUri?: string;
  };
}

/**
 * Creates a stdio transport for MCP
 * @param config Stdio transport configuration
 * @returns Stdio client transport instance
 */
export function createStdioTransport(config: StdioTransportConfig): McpClientTransport {
  // Import dynamically to avoid potential module resolution issues
  const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
  
  // Set environment variables for authentication
  const env = {
    ...process.env,
    ...config.env,
    // Allow OAuth callback server to run on specified port
    MCP_AUTH_PORT: config.auth?.callbackPort?.toString() || "3334",
    // Set longer timeout for auth flow if specified
    MCP_AUTH_TIMEOUT: config.auth?.authTimeout?.toString() || "120000"
  };
  
  return new StdioClientTransport({
    command: config.command,
    args: config.args,
    cwd: config.cwd,
    env,
    // Set longer timeout for the initial connection to allow for auth
    timeout: config.timeout || 120000
  });
}

/**
 * Configuration for SSE transport
 */
export interface SseTransportConfig {
  /** Server URL */
  url: string;
  
  /** Authentication configuration */
  auth?: {
    method: "bearer" | "basic" | "oauth";
    token?: string;
    username?: string;
    password?: string;
    clientId?: string;
    clientSecret?: string;
    redirectUri?: string;
  };
  
  /** Optional additional headers */
  headers?: Record<string, string>;
}

/**
 * Creates an HTTP transport for MCP
 * @param config HTTP transport configuration
 * @returns HTTP client transport instance
 */
export function createHttpTransport(config: HttpTransportConfig): McpClientTransport {
  // Import dynamically to avoid potential module resolution issues
  const { HttpClientTransport } = require('@modelcontextprotocol/sdk/client/http.js');
  
  // Prepare headers with authentication if provided
  const headers = { ...(config.headers || {}) };
  
  if (config.auth) {
    switch (config.auth.method) {
      case "bearer":
        if (config.auth.token) {
          headers["Authorization"] = `Bearer ${config.auth.token}`;
        }
        break;
      case "basic":
        if (config.auth.username && config.auth.password) {
          const credentials = btoa(`${config.auth.username}:${config.auth.password}`);
          headers["Authorization"] = `Basic ${credentials}`;
        }
        break;
    }
  }
  
  return new HttpClientTransport({
    url: config.url,
    headers
  });
}

/**
 * Creates an SSE transport for MCP
 * @param config SSE transport configuration
 * @returns SSE client transport instance
 */
export function createSseTransport(config: SseTransportConfig): McpClientTransport {
  // Import dynamically to avoid potential module resolution issues
  const { SSEClientTransport } = require('@modelcontextprotocol/sdk/client/sse.js');
  
  // Prepare headers with authentication if provided
  const headers = { ...(config.headers || {}) };
  let authProvider;
  
  if (config.auth) {
    switch (config.auth.method) {
      case "bearer":
        if (config.auth.token) {
          headers["Authorization"] = `Bearer ${config.auth.token}`;
        }
        break;
      case "basic":
        if (config.auth.username && config.auth.password) {
          const credentials = btoa(`${config.auth.username}:${config.auth.password}`);
          headers["Authorization"] = `Basic ${credentials}`;
        }
        break;
      case "oauth":
        if (config.auth.clientId) {
          // Import OAuth provider dynamically
          const { OAuthClientProvider } = require('@modelcontextprotocol/sdk/client/auth.js');
          
          authProvider = new OAuthClientProvider({
            clientId: config.auth.clientId,
            clientSecret: config.auth.clientSecret,
            redirectUri: config.auth.redirectUri
          });
        }
        break;
    }
  }
  
  // Create SSE transport with the appropriate configuration
  return new SSEClientTransport(
    new URL(config.url),
    {
      authProvider,
      eventSourceInit: {
        headers
      },
      requestInit: {
        headers
      }
    }
  );
}
