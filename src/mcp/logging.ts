import { LoggerFactory } from '../core/Logger';

/**
 * Loggers for MCP module
 * Can be controlled with DEBUG env variable using these patterns:
 * - All MCP logs: DEBUG="mod:mcp=debug"
 * - Only client logs: DEBUG="mod:mcp/client=debug"
 * - Only transport logs: DEBUG="mod:mcp/transport=debug"
 * - Tools logs: DEBUG="mod:mcp/tools=debug"
 * - Connection logs: DEBUG="mod:mcp/connection=debug"
 */
export const mcpLoggers = {
    // General MCP functionality
    mcp: LoggerFactory.getLogger({
        module: 'mcp'
    }),

    // Client for MCP protocol
    client: LoggerFactory.getLogger({
        module: 'mcp',
        component: 'client'
    }),

    // Transport layer (HTTP/stdio)
    transport: LoggerFactory.getLogger({
        module: 'mcp',
        component: 'transport'
    }),

    // Tools/capabilities handling
    tools: LoggerFactory.getLogger({
        module: 'mcp',
        component: 'tools'
    }),

    // Connection management
    connection: LoggerFactory.getLogger({
        module: 'mcp',
        component: 'connection'
    })
};
