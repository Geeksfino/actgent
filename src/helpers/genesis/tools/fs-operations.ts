import fs from 'fs/promises';
import path from 'path';
import { createRuntime } from '../../../runtime';

const runtime = createRuntime();

// Define operation types
export type FSOperation = 'read' | 'write' | 'create' | 'remove' | 'exists' | 'list';

export interface FSOperationResult {
    success: boolean;
    data?: string | string[] | boolean;  // String for read/write, string[] for list, boolean for exists
    error?: string;
}

export interface FSOperationOptions {
    recursive?: boolean;  // For directory operations
}

async function ensureDirectory(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
}

async function safeRemove(targetPath: string, recursive: boolean = false): Promise<void> {
    const exists = await fs.access(targetPath).then(() => true).catch(() => false);
    if (!exists) return;

    const stats = await fs.stat(targetPath);
    if (stats.isDirectory()) {
        if (!recursive) {
            throw new Error('Cannot remove directory without recursive flag');
        }
        await fs.rm(targetPath, { recursive: true });
    } else {
        await fs.unlink(targetPath);
    }
}

export async function readFile(filePath: string): Promise<FSOperationResult> {
    try {
        const expandedPath = filePath.replace(/^~/, await runtime.os.homedir());
        const absolutePath = path.resolve(expandedPath);
        const content = await fs.readFile(absolutePath, 'utf-8');
        return { success: true, data: content };
    } catch (error) {
        return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
        };
    }
}

export async function writeFile(filePath: string, content: string): Promise<FSOperationResult> {
    try {
        const expandedPath = filePath.replace(/^~/, await runtime.os.homedir());
        const absolutePath = path.resolve(expandedPath);
        await ensureDirectory(path.dirname(absolutePath));
        await fs.writeFile(absolutePath, content, 'utf-8');
        return { success: true };
    } catch (error) {
        return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
        };
    }
}

export async function createPath(targetPath: string, options: FSOperationOptions = {}): Promise<FSOperationResult> {
    try {
        const expandedPath = targetPath.replace(/^~/, await runtime.os.homedir());
        const absolutePath = path.resolve(expandedPath);
        
        const stats = await fs.stat(absolutePath).catch(() => null);
        if (stats) {
            throw new Error('Path already exists');
        }

        if (targetPath.endsWith('/')) {
            await fs.mkdir(absolutePath, { recursive: !!options.recursive });
        } else {
            await ensureDirectory(path.dirname(absolutePath));
            await fs.writeFile(absolutePath, '', 'utf-8');
        }
        return { success: true };
    } catch (error) {
        return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
        };
    }
}

export async function removePath(targetPath: string, options: FSOperationOptions = {}): Promise<FSOperationResult> {
    try {
        const expandedPath = targetPath.replace(/^~/, await runtime.os.homedir());
        const absolutePath = path.resolve(expandedPath);
        await safeRemove(absolutePath, options.recursive);
        return { success: true };
    } catch (error) {
        return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
        };
    }
}

export async function pathExists(targetPath: string): Promise<FSOperationResult> {
    try {
        const expandedPath = targetPath.replace(/^~/, await runtime.os.homedir());
        const absolutePath = path.resolve(expandedPath);
        const exists = await fs.access(absolutePath).then(() => true).catch(() => false);
        return { success: true, data: exists };
    } catch (error) {
        return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
        };
    }
}

export async function listDirectory(dirPath: string): Promise<FSOperationResult> {
    try {
        const expandedPath = dirPath.replace(/^~/, await runtime.os.homedir());
        const absolutePath = path.resolve(expandedPath);
        const stats = await fs.stat(absolutePath);
        if (!stats.isDirectory()) {
            throw new Error('Path is not a directory');
        }
        const items = await fs.readdir(absolutePath);
        return { success: true, data: items };
    } catch (error) {
        return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
        };
    }
}

// CLI implementation
async function main() {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.error('Usage: node fs-operations.js <operation> <path> [content] [--recursive]');
        process.exit(1);
    }

    const [operation, targetPath] = args;
    const content = args[2];
    const recursive = args.includes('--recursive');

    try {
        let result: FSOperationResult;
        switch (operation as FSOperation) {
            case 'read':
                result = await readFile(targetPath);
                break;
            case 'write':
                if (!content) throw new Error('Content required for write operation');
                result = await writeFile(targetPath, content);
                break;
            case 'create':
                result = await createPath(targetPath, { recursive });
                break;
            case 'remove':
                result = await removePath(targetPath, { recursive });
                break;
            case 'exists':
                result = await pathExists(targetPath);
                break;
            case 'list':
                result = await listDirectory(targetPath);
                break;
            default:
                throw new Error(`Unsupported operation: ${operation}`);
        }
        console.log(JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}