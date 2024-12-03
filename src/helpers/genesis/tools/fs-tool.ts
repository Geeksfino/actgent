import { JSONOutput, RunOptions, Tool } from "../../../core/Tool";
import { ExecutionContext } from "../../../core/ExecutionContext";
import { z } from "zod";
import {
    FSOperation,
    FSOperationResult,
    readFile,
    writeFile,
    createPath,
    removePath,
    pathExists,
    listDirectory
} from './fs-operations';

interface FSInput {
    operation: FSOperation;
    path: string;
    content?: string;  // For write operations
    recursive?: boolean;  // For directory operations
}

type FSOutput = JSONOutput<FSOperationResult>;

export class FileSystemTool extends Tool<FSInput, FSOutput> {
    constructor() {
        super(
            "FileSystemTool",
            "Perform file system operations (create, read, write, remove)"
        );
    }

    schema(): z.ZodSchema<FSInput> {
        return z.object({
            operation: z.enum(['read', 'write', 'create', 'remove', 'exists', 'list']),
            path: z.string(),
            content: z.string().optional(),
            recursive: z.boolean().optional()
        });
    }

    public async execute(
        input: FSInput,
        context: ExecutionContext,
        runOptions: RunOptions
    ): Promise<FSOutput> {
        let result: FSOperationResult;

        switch (input.operation) {
            case 'read':
                result = await readFile(input.path);
                break;
            case 'write':
                if (!input.content) {
                    return new JSONOutput({
                        success: false,
                        error: 'Content is required for write operation'
                    });
                }
                result = await writeFile(input.path, input.content);
                break;
            case 'create':
                result = await createPath(input.path, { recursive: input.recursive });
                break;
            case 'remove':
                result = await removePath(input.path, { recursive: input.recursive });
                break;
            case 'exists':
                result = await pathExists(input.path);
                break;
            case 'list':
                result = await listDirectory(input.path);
                break;
            default:
                result = {
                    success: false,
                    error: `Unsupported operation: ${input.operation}`
                };
        }

        return new JSONOutput(result);
    }
}