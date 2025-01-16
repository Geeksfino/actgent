import { z } from 'zod';

/**
 * Base schemas for different types of memory content
 */

export const ConversationSchema = z.object({
    role: z.enum(['user', 'assistant', 'system']),
    message: z.string(),
    timestamp: z.date().optional().default(() => new Date())
});

export const TaskSchema = z.object({
    taskId: z.string(),
    status: z.enum(['pending', 'in_progress', 'completed', 'failed']),
    description: z.string(),
    steps: z.array(z.string()).optional(),
    priority: z.number().min(0).max(10).optional(),
    deadline: z.date().optional()
});

export const KnowledgeSchema = z.object({
    fact: z.string(),
    confidence: z.number().min(0).max(1),
    source: z.string(),
    relations: z.array(z.string()).optional(),
    lastVerified: z.date().optional()
});

export const ReasoningSchema = z.object({
    premise: z.string(),
    conclusion: z.string(),
    confidence: z.number().min(0).max(1),
    steps: z.array(z.string()),
    assumptions: z.array(z.string()).optional()
});

export const EmotionalSchema = z.object({
    valence: z.number().min(-1).max(1),
    arousal: z.number().min(-1).max(1),
    context: z.string(),
    trigger: z.string().optional()
});

// Type exports for convenience
export type ConversationContent = z.infer<typeof ConversationSchema>;
export type TaskContent = z.infer<typeof TaskSchema>;
export type KnowledgeContent = z.infer<typeof KnowledgeSchema>;
export type ReasoningContent = z.infer<typeof ReasoningSchema>;
export type EmotionalContent = z.infer<typeof EmotionalSchema>;

// Schema registry for easy access
export const MemorySchemas = {
    conversation: ConversationSchema,
    task: TaskSchema,
    knowledge: KnowledgeSchema,
    reasoning: ReasoningSchema,
    emotional: EmotionalSchema
} as const;

export type MemoryContentType = keyof typeof MemorySchemas;
