/**
 * AdminService - HTTP service for managing agents and file system operations
 * 
 * Base URL: http://localhost:11370
 * 
 * Endpoints:
 * 
 * 1. Agent Operations
 * ------------------
 * GET /api/v1/agents/{agentName}
 *   Serializes an agent scaffold back into its original configuration
 *   Returns: AgentGeneratorInput object
 *   Example: GET /api/v1/agents/myAgent
 * 
 * 2. File System Operations
 * ------------------------
 * All FS operations return: { success: boolean, data?: string | string[] | boolean, error?: string }
 * 
 * GET /api/v1/fs/{agentName}/read/{path}
 *   Reads file content
 *   Returns: { success: true, data: "file content" }
 *   Example: GET /api/v1/fs/myAgent/read/path/to/file.txt
 * 
 * POST /api/v1/fs/{agentName}/write/{path}
 *   Writes content to file
 *   Body: { "content": "file content" }
 *   Returns: { success: true }
 *   Example: POST /api/v1/fs/myAgent/write/path/to/file.txt
 * 
 * PUT /api/v1/fs/{agentName}/create/{path}
 *   Creates file or directory
 *   Query params: ?recursive=true (optional, for directories)
 *   Returns: { success: true }
 *   Example: PUT /api/v1/fs/myAgent/create/path/to/dir?recursive=true
 * 
 * DELETE /api/v1/fs/{agentName}/remove/{path}
 *   Removes file or directory
 *   Query params: ?recursive=true (optional, for directories)
 *   Returns: { success: true }
 *   Example: DELETE /api/v1/fs/myAgent/remove/path/to/file.txt
 * 
 * GET /api/v1/fs/{agentName}/exists/{path}
 *   Checks if path exists
 *   Returns: { success: true, data: true|false }
 *   Example: GET /api/v1/fs/myAgent/exists/path/to/check
 * 
 * GET /api/v1/fs/{agentName}/list/{path}
 *   Lists directory contents
 *   Returns: { success: true, data: string[] }
 *   Example: GET /api/v1/fs/myAgent/list/path/to/dir
 * 
 * CORS:
 * - All endpoints support CORS with '*' origin
 * - Supported methods: GET, POST, PUT, DELETE, OPTIONS
 * - Content-Type: application/json
 */

import { Server, type Subprocess } from "bun";
import { BaseAgent } from '../../../agent/BaseAgent';
import { LoggingConfig } from "../../../core/configs";
import { logger, LogLevel } from '../../../core/Logger';
import { serializeAgentScaffold } from '../tools/scaffold-serializer';
import { AgentManifestManager } from '../tools/agent-manifest';
import {
    readFile,
    writeFile,
    createPath,
    removePath,
    pathExists,
    listDirectory,
    FSOperationResult
} from '../tools/fs-operations';
import path from 'path';

interface WriteRequestBody {
    content: string;
}

interface Instruction {
    name: string;
}

interface RunningAgent {
    instance: Subprocess;
    loggerConfig: LoggingConfig;
}

export class AdminService {
    private server?: Server;
    private port: number;
    private host: string;
    private agentsDir: string;
    private runningAgents: Map<string, RunningAgent> = new Map();
    private manifestManager: AgentManifestManager;

    constructor(port: number = 11370, host: string = 'localhost', agentsDir: string) {
        this.port = port;
        this.host = host;
        this.agentsDir = agentsDir;
        this.manifestManager = new AgentManifestManager(agentsDir);
        logger.trace(`AdminService initialized with port ${port}, host ${host}, and agents directory ${agentsDir}`);
    }

    /**
     * Resolves an agent name to its actual directory using the manifest.
     * If no specific instance is found, falls back to the original name for backward compatibility.
     */
    private async resolveAgentDirectory(agentName: string): Promise<string> {
        try {
            const latestInstance = await this.manifestManager.getLatestInstance(agentName);
            if (latestInstance) {
                return path.join(this.agentsDir, latestInstance.directory);
            }
            // Fallback to original behavior for backward compatibility
            logger.warning(`No manifest entry found for agent ${agentName}, falling back to direct name`);
            return path.join(this.agentsDir, agentName);
        } catch (error) {
            logger.error(`Error resolving agent directory for ${agentName}:`, error);
            // Fallback to original behavior
            return path.join(this.agentsDir, agentName);
        }
    }

    async startAgent(agentName: string): Promise<FSOperationResult> {
        try {
            if (this.runningAgents.has(agentName)) {
                return { success: false, error: 'Agent is already running' };
            }

            const agentDir = await this.resolveAgentDirectory(agentName);
            const agentPath = path.join(agentDir, `${agentName}.ts`);
            const runnerPath = path.join(agentDir, 'index.ts');
            
            if (!await pathExists(agentPath)) {
                return { success: false, error: 'Agent not found' };
            }

            logger.debug(`Starting agent ${agentName} with runner at ${runnerPath}`);
            
            // Run from project root, just like CLI command
            const proc = Bun.spawn(['bun', 'run', runnerPath, '--log-level', 'debug'], {
                // cwd should be project root, not agent directory
                env: {
                    // Only pass through essential system vars
                    PATH: process.env.PATH || '',
                    HOME: process.env.HOME || '',
                    TMPDIR: process.env.TMPDIR || '/tmp',
                },
                stdio: ['inherit', 'inherit', 'inherit']
            });

            // Handle process exit
            proc.exited.then((code) => {
                logger.info(`Agent ${agentName} exited with code ${code}`);
                this.runningAgents.delete(agentName);
            }).catch((error: Error) => {
                logger.error(`Agent ${agentName} process error:`, error);
                this.runningAgents.delete(agentName);
            });

            // Store the running instance
            this.runningAgents.set(agentName, {
                instance: proc,
                loggerConfig: {
                    destination: path.join(agentDir, `${agentName}.log`)
                }
            });

            return { success: true };
        } catch (error) {
            logger.error(`Error starting agent ${agentName}:`, error);
            return { 
                success: false, 
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    async stopAgent(agentName: string): Promise<FSOperationResult> {
        try {
            const runningAgent = this.runningAgents.get(agentName);
            if (!runningAgent) {
                return { success: false, error: 'Agent not running' };
            }

            // Kill the subprocess with SIGTERM for graceful shutdown
            logger.debug(`[AdminService] Stopping agent ${agentName}`);
            runningAgent.instance.kill(2); // SIGTERM
            
            // Give it a moment to clean up
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Force kill if still running
            if (this.runningAgents.has(agentName)) {
                runningAgent.instance.kill(9); // SIGKILL
                this.runningAgents.delete(agentName);
            }

            return { success: true };
        } catch (error) {
            logger.error(`Error stopping agent ${agentName}:`, error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    async start(): Promise<void> {
        logger.trace('[AdminService] Starting service...');
        
        this.server = Bun.serve({
            port: this.port,
            hostname: this.host,
            development: false,

            fetch: async (req: Request) => {
                logger.trace(`[AdminService] Received request: ${req.method} ${req.url}`);
                const url = new URL(req.url);
                logger.debug(`[AdminService] Parsed URL pathname: ${url.pathname}`);
                
                const corsHeaders = {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Content-Type': 'application/json'
                };

                if (req.method === 'OPTIONS') {
                    return new Response(null, { headers: corsHeaders });
                }

                try {
                    if (url.pathname.startsWith('/api/v1/agents/')) {
                        logger.debug('[AdminService] Matched agents endpoint');
                        const parts = url.pathname.split('/').filter(p => p); // Remove empty parts
                        
                        // Check if this is an operation or direct agent access
                        const isOperation = ['start', 'stop'].includes(parts[3]);
                        const agentName = isOperation 
                            ? parts.slice(4).join('/') // Skip ['api', 'v1', 'agents', 'operation']
                            : parts.slice(3).join('/'); // Skip ['api', 'v1', 'agents']
                        const operation = isOperation ? parts[3] : null;
                        
                        logger.debug(`[AdminService] Parsed path - operation: ${operation}, agent: ${agentName}`);
                        
                        if (operation === 'start' && req.method === 'POST') {
                            logger.debug(`[AdminService] Starting agent: ${agentName}`);
                            const result = await this.startAgent(agentName);
                            return new Response(JSON.stringify(result), { headers: corsHeaders });
                        }
                        
                        if (operation === 'stop' && req.method === 'POST') {
                            logger.debug(`[AdminService] Stopping agent: ${agentName}`);
                            const result = await this.stopAgent(agentName);
                            return new Response(JSON.stringify(result), { headers: corsHeaders });
                        }
                        
                        // Handle agent serialization (GET request)
                        const agentDir = await this.resolveAgentDirectory(agentName);
                        logger.debug(`[AdminService] Full agent directory path: ${agentDir}`);
                        
                        try {
                            // Retry helper function
                            async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 5, delay = 1000): Promise<T> {
                                for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                                    try {
                                        return await fn();
                                    } catch (error) {
                                        if (attempt === maxAttempts) throw error;
                                        await new Promise(resolve => setTimeout(resolve, delay));
                                        logger.debug(`[AdminService] Retry attempt ${attempt} of ${maxAttempts}`);
                                    }
                                }
                                throw new Error('Max retries exceeded');
                            }
                            
                            const result = await withRetry(() => serializeAgentScaffold(agentDir));
                            logger.debug(`[AdminService] Serialized agent scaffold: ${JSON.stringify(result, null, 2)}`);
                            
                            return new Response(JSON.stringify(result, null, 2).replace(/\\u003[CE]/g, match => 
                                match === '\\u003E' ? '>' : '<'
                            ), { headers: corsHeaders });
                        } catch (error) {
                            logger.error('[AdminService] Error serializing agent scaffold:', error);
                            return new Response(
                                JSON.stringify({
                                    success: false,
                                    error: error instanceof Error ? error.message : String(error)
                                }),
                                { status: 400, headers: corsHeaders }
                            );
                        }
                    }
                    
                    else if (url.pathname.startsWith('/api/v1/fs/')) {
                        logger.debug('[AdminService] Matched fs endpoint');
                        const parts = url.pathname.split('/').filter(p => p); // Remove empty parts
                        // parts should be ['api', 'v1', 'fs', '{agent_name}', '{operation}', ...rest]
                        
                        if (parts.length < 5) {
                            throw new Error('Invalid file system endpoint path');
                        }

                        const agentName = parts[3];  // Get agent name after /api/v1/fs/
                        const operation = parts[4];  // Get operation after agent name
                        const resourcePath = parts.slice(5).join('/');  // Get remaining path after operation
                        const recursive = url.searchParams.get('recursive') === 'true';

                        // Construct the full path relative to the agent's directory
                        const agentDir = await this.resolveAgentDirectory(agentName);
                        const fullPath = path.join(agentDir, resourcePath);

                        // Verify the path is within the agent's directory
                        if (!fullPath.startsWith(agentDir)) {
                            throw new Error('Access denied: Path is outside agent directory');
                        }

                        logger.debug(`[AdminService] File operation:`, {
                            agentName,
                            operation,
                            resourcePath,
                            fullPath
                        });

                        let response: FSOperationResult;

                        switch (operation) {
                            case 'read':
                                if (req.method === 'GET') {
                                    logger.debug(`[AdminService] Reading file: ${fullPath}`);
                                    response = await readFile(fullPath);
                                    return new Response(JSON.stringify(response), { headers: corsHeaders });
                                }
                                break;

                            case 'write':
                                if (req.method === 'POST') {
                                    const body = await req.json() as WriteRequestBody;
                                    if (!body?.content) {
                                        throw new Error('Content is required for write operation');
                                    }
                                    logger.debug(`[AdminService] Writing to file: ${fullPath}`);
                                    response = await writeFile(fullPath, body.content);
                                    return new Response(JSON.stringify(response), { headers: corsHeaders });
                                }
                                break;

                            case 'create':
                                if (req.method === 'PUT') {
                                    logger.debug(`[AdminService] Creating path: ${fullPath}`);
                                    response = await createPath(fullPath, { recursive });
                                    return new Response(JSON.stringify(response), { headers: corsHeaders });
                                }
                                break;

                            case 'remove':
                                if (req.method === 'DELETE') {
                                    logger.debug(`[AdminService] Removing path: ${fullPath}`);
                                    response = await removePath(fullPath, { recursive });
                                    return new Response(JSON.stringify(response), { headers: corsHeaders });
                                }
                                break;

                            case 'exists':
                                if (req.method === 'GET') {
                                    logger.debug(`[AdminService] Checking if path exists: ${fullPath}`);
                                    response = await pathExists(fullPath);
                                    return new Response(JSON.stringify(response), { headers: corsHeaders });
                                }
                                break;

                            case 'list':
                                if (req.method === 'GET') {
                                    logger.debug(`[AdminService] Listing directory contents: ${fullPath}`);
                                    response = await listDirectory(fullPath);
                                    return new Response(JSON.stringify(response), { headers: corsHeaders });
                                }
                                break;
                        }
                    }

                    else if (url.pathname.startsWith('/api/v1/manifest/')) {
                        logger.debug('[AdminService] Matched manifest endpoint');
                        const parts = url.pathname.split('/').filter(p => p); // Remove empty parts
                        const agentName = parts[3] || '';

                        if (req.method === 'GET') {
                            const instances = await this.manifestManager.getAgentInstances(agentName);
                            return new Response(JSON.stringify({
                                success: true,
                                data: instances
                            }), { headers: corsHeaders });
                        }
                        return new Response(JSON.stringify({
                            success: false,
                            error: 'Method not allowed'
                        }), { status: 405, headers: corsHeaders });
                    }

                    return new Response('Not found', { status: 404, headers: corsHeaders });

                } catch (error) {
                    logger.error('[AdminService] Error:', error);
                    return new Response(
                        JSON.stringify({
                            success: false,
                            error: error instanceof Error ? error.message : String(error)
                        }),
                        { status: 400, headers: corsHeaders }
                    );
                }
            }
        });

        logger.info(`[AdminService] Running at http://${this.host}:${this.port}`);
    }

    async stop(): Promise<void> {
        if (this.server) {
            this.server.stop();
            logger.trace('[AdminService] Stopped');
        }
    }
}