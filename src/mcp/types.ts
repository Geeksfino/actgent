/**
 * Type definitions for MCP client integration
 */

import { Logger } from '../core/Logger';
import { z } from 'zod';

// Import types from MCP SDK directly
type TransportOptions = any;

/**
 * Configuration for MCP client
 */
export interface McpClientConfig {
  /** Client name */
  name: string;
  
  /** Client version */
  version: string;
  
  /** Optional capabilities configuration */
  capabilities?: {
    /** Prompts capability configuration */
    prompts?: Record<string, unknown>;
    
    /** Resources capability configuration */
    resources?: Record<string, unknown>;
    
    /** Tools capability configuration */
    tools?: Record<string, unknown>;
  };
  
  /** Optional logger instance */
  logger?: Logger;
}

/**
 * MCP client transport interface
 */
export interface McpClientTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(message: any): Promise<void>;
  receive(): Promise<any>;
}

/**
 * MCP resource interface
 */
export interface McpResource {
  /** Resource URI */
  uri: string;
  
  /** Resource content as text */
  text: string;
  
  /** Optional metadata for the resource */
  metadata?: Record<string, any>;
}

/**
 * MCP tool information
 */
export interface McpToolInfo {
  /** Tool name */
  name: string;
  
  /** Tool description */
  description?: string;
  
  /** Input schema for the tool */
  inputSchema: z.ZodSchema<any>;
  
  /** Output schema for the tool */
  outputSchema: z.ZodSchema<any>;
}

/**
 * MCP prompt information
 */
export interface McpPromptInfo {
  /** Prompt name */
  name: string;
  
  /** Prompt description */
  description?: string;
  
  /** Prompt arguments */
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

/**
 * MCP resource listing information
 */
export interface McpResourceInfo {
  /** Resource URI or pattern */
  uri: string;
  
  /** Resource description */
  description?: string;
}
