import { AgentMemorySystem } from '../../../src/core/memory/AgentMemorySystem';
import { InMemoryStorage } from '../../../src/core/memory/storage/InMemoryStorage';
import { InMemoryIndex } from '../../../src/core/memory/storage/InMemoryIndex';
import { IMemoryUnit, SessionMemoryContext, MemoryType } from '../../../src/core/memory/types';
import { Subject, from, concatMap, delay } from 'rxjs';
import * as fs from 'fs/promises';

interface ConversationMessage {
    role: 'user' | 'assistant';
    content: string | {
        messageType: string;
        data: any;
    };
}

export class ConversationEmulator {
    private memorySystem: AgentMemorySystem;
    private messageSubject = new Subject<ConversationMessage>();
    private conversationHistory: ConversationMessage[] = [];

    constructor() {
        // Initialize memory system with in-memory storage and index
        this.memorySystem = new AgentMemorySystem(
            new InMemoryStorage(),
            new InMemoryIndex()
        );

        // Setup memory system observers
        this.setupObservers();
    }

    private setupObservers() {
        // Observe context changes to detect memory transitions
        this.memorySystem.onContextChange((context: SessionMemoryContext) => {
            console.log('Memory System Context Change:', {
                type: context.contextType,
                timestamp: context.timestamp,
                phase: context.interactionPhase
            });
        });

        // Directly observe memory states after processing each message
        this.messageSubject.pipe(
            concatMap(async (message) => {
                // Print message
                console.log(`\n=== Replaying Message: ${message.role} ===`);
                console.log(message);

                // Store in memory system
                await this.memorySystem.remember(message, new Map([
                    ['role', message.role],
                    ['type', typeof message.content === 'string' ? 'text' : message.content]
                ]));

                // Print memory snapshots after storing message
                await this.printMemorySnapshots();

                return message;
            }),
            delay(100) // Reduced delay for faster processing
        ).subscribe({
            error: (error) => {
                console.error('Error Processing Message:', error);
            }
        });
    }

    private async printMemorySnapshots() {
        // Display working memory
        console.log('\n=== Working Memory ===');
        const workingMemories = await this.memorySystem.recall({
            types: [MemoryType.WORKING]
        });
        workingMemories.forEach(m => {
            console.log(`Memory ID: ${m.id}, Role: ${m.metadata.get('role')}`);
            console.log('Content:', m.content);
        });
        console.table(workingMemories.map(m => ({
            id: m.id,
            role: m.metadata.get('role'),
            content: m.metadata.get('role') === 'user'
                ? (typeof m.content === 'string' ? m.content : m.content.content).padEnd(50).slice(0, 50)
                : m.content && m.content.content && m.content.content.data
                    ? JSON.stringify(m.content.content.data).padEnd(50).slice(0, 50)
                    : ''.padEnd(50)
        })));

        // Display semantic memory
        console.log('\n=== Semantic Memory ===');
        const semanticMemories = await this.memorySystem.recall({
            types: [MemoryType.SEMANTIC]
        });
        console.table(semanticMemories.map(m => ({
            id: m.id,
            content: (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).padEnd(30).slice(0, 30),
            type: m.metadata.get('type')
        })));

        // Display episodic memory
        console.log('\n=== Episodic Memory ===');
        const episodicMemories = await this.memorySystem.recall({
            types: [MemoryType.EPISODIC]
        });
        console.table(episodicMemories.map(m => ({
            id: m.id,
            content: (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).padEnd(30).slice(0, 30),
            type: m.metadata.get('type')
        })));
    }

    public async loadConversation(filePath: string) {
        const content = await fs.readFile(filePath, 'utf-8');
        this.conversationHistory = JSON.parse(content);
        console.log('Loaded conversation history');
    }

    public async replayConversation() {
        console.log('\n=== Starting Conversation Replay ===\n');

        // Process messages sequentially
        for (const message of this.conversationHistory) {
            this.messageSubject.next(message);
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Wait for all messages to be processed
        await new Promise(resolve => setTimeout(resolve, 100));

        console.log('\n=== Conversation Replay Complete ===\n');

        // Complete the message subject
        this.messageSubject.complete();

        // Exit process
        process.exit(0);
    }
}
