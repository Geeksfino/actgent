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
 * GET /api/v1/fs/read/{path}
 *   Reads file content
 *   Returns: { success: true, data: "file content" }
 *   Example: GET /api/v1/fs/read/path/to/file.txt
 * 
 * POST /api/v1/fs/write/{path}
 *   Writes content to file
 *   Body: { "content": "file content" }
 *   Returns: { success: true }
 *   Example: POST /api/v1/fs/write/path/to/file.txt
 * 
 * PUT /api/v1/fs/create/{path}
 *   Creates file or directory
 *   Query params: ?recursive=true (optional, for directories)
 *   Returns: { success: true }
 *   Example: PUT /api/v1/fs/create/path/to/dir?recursive=true
 * 
 * DELETE /api/v1/fs/remove/{path}
 *   Removes file or directory
 *   Query params: ?recursive=true (optional, for directories)
 *   Returns: { success: true }
 *   Example: DELETE /api/v1/fs/remove/path/to/file.txt
 * 
 * GET /api/v1/fs/exists/{path}
 *   Checks if path exists
 *   Returns: { success: true, data: true|false }
 *   Example: GET /api/v1/fs/exists/path/to/check
 * 
 * GET /api/v1/fs/list/{path}
 *   Lists directory contents
 *   Returns: { success: true, data: string[] }
 *   Example: GET /api/v1/fs/list/path/to/dir
 * 
 * CORS:
 * - All endpoints support CORS with '*' origin
 * - Supported methods: GET, POST, PUT, DELETE, OPTIONS
 * - Content-Type: application/json
 */

import { Server } from "bun";
import { logger } from '../../../core/Logger';
import { serializeAgentScaffold } from '../tools/scaffold-serializer';
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

export class AdminService {
    private server?: Server;
    private port: number;
    private host: string;
    private agentsDir: string;

    constructor(port: number = 11370, host: string = 'localhost', agentsDir: string) {
        this.port = port;
        this.host = host;
        this.agentsDir = agentsDir;
        logger.trace(`AdminService initialized with port ${port}, host ${host}, and agents directory ${agentsDir}`);
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
                        const agentName = url.pathname.split('/').slice(4).join('/');
                        const agentDir = path.join(this.agentsDir, agentName);
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
                        const operation = url.pathname.split('/')[4];  // Get operation after /api/v1/fs/
                        const path = url.pathname.split('/').slice(5).join('/');  // Get path after operation
                        const recursive = url.searchParams.get('recursive') === 'true';

                        let response: FSOperationResult;

                        switch (operation) {
                            case 'read':
                                if (req.method === 'GET') {
                                    logger.debug(`[AdminService] Attempting to read file: ${path}`);
                                    response = await readFile(path);
                                    return new Response(JSON.stringify(response), { headers: corsHeaders });
                                }
                                break;

                            case 'write':
                                if (req.method === 'POST') {
                                    const body = await req.json() as WriteRequestBody;
                                    if (!body?.content) {
                                        throw new Error('Content is required for write operation');
                                    }
                                    logger.debug(`[AdminService] Attempting to write to file: ${path}`);
                                    response = await writeFile(path, body.content);
                                    return new Response(JSON.stringify(response), { headers: corsHeaders });
                                }
                                break;

                            case 'create':
                                if (req.method === 'PUT') {
                                    logger.debug(`[AdminService] Attempting to create path: ${path}`);
                                    response = await createPath(path, { recursive });
                                    return new Response(JSON.stringify(response), { headers: corsHeaders });
                                }
                                break;

                            case 'remove':
                                if (req.method === 'DELETE') {
                                    logger.debug(`[AdminService] Attempting to remove path: ${path}`);
                                    response = await removePath(path, { recursive });
                                    return new Response(JSON.stringify(response), { headers: corsHeaders });
                                }
                                break;

                            case 'exists':
                                if (req.method === 'GET') {
                                    logger.debug(`[AdminService] Checking if path exists: ${path}`);
                                    response = await pathExists(path);
                                    return new Response(JSON.stringify(response), { headers: corsHeaders });
                                }
                                break;

                            case 'list':
                                if (req.method === 'GET') {
                                    logger.debug(`[AdminService] Listing directory contents: ${path}`);
                                    response = await listDirectory(path);
                                    return new Response(JSON.stringify(response), { headers: corsHeaders });
                                }
                                break;
                        }
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