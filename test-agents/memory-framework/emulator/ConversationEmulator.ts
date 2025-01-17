import { AgentMemorySystem } from '../../../src/core/memory/AgentMemorySystem';
import { MemoryType } from '../../../src/core/memory/base';
import { Subject, from, concatMap, delay } from 'rxjs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { TableFormatter } from './helper';
import { logger } from '../../../src/core/Logger';

interface Message {
    role: 'user' | 'assistant';
    content: string | {
        messageType: string;
        data: any;
    };
}

/**
 * Emulates a conversation to test ephemeral memory behavior
 */
export class ConversationEmulator {
    private memorySystem: AgentMemorySystem;
    private messageSubject: Subject<Message>;
    private conversationHistory: Message[] = [];
    private replayDelay: number = 20; // milliseconds between messages
    private messageCount: number = 0;
    private tableFormatter: TableFormatter;

    constructor() {
        this.memorySystem = new AgentMemorySystem();
        this.messageSubject = new Subject<Message>();
        this.tableFormatter = new TableFormatter();
        this.setupObservers();
    }

    private async printMemorySnapshot() {
        await this.tableFormatter.printMemorySnapshot(this.memorySystem, this.messageCount);
    }

    private setupObservers() {
        this.messageSubject.pipe(
            concatMap(async message => {
                this.messageCount++;
                logger.info(`\n=== Processing Message ${this.messageCount} (${message.role}) ===`);
                logger.info(typeof message.content === 'string' ? 
                    message.content : 
                    JSON.stringify(message.content, null, 2));

                const content = typeof message.content === 'string' 
                    ? message.content 
                    : JSON.stringify(message.content);
                
                const metadata = new Map<string, any>();
                metadata.set('role', message.role);
                metadata.set('timestamp', new Date());
                
                await this.memorySystem.remember(content, undefined, metadata);
                
                return from([message]).pipe(
                    delay(this.replayDelay)
                );
            })
        ).subscribe({
            error: (error) => {
                logger.error('Error processing message:', error);
            }
        });
    }

    /**
     * Load conversation history from file
     */
    async loadConversationHistory(filePath: string): Promise<void> {
        try {
            const data = await fs.readFile(filePath, 'utf8');
            this.conversationHistory = JSON.parse(data);
            logger.info(`Loaded ${this.conversationHistory.length} messages from history`);
        } catch (error) {
            logger.error('Error loading conversation history:', error);
            throw error;
        }
    }

    /**
     * Start replaying the conversation
     */
    async replayConversation(): Promise<void> {
        logger.info('Starting conversation replay...');
        this.messageCount = 0;
        
        for (const message of this.conversationHistory) {
            this.messageSubject.next(message);
            await new Promise(resolve => setTimeout(resolve, this.replayDelay));
        }

        logger.info('\nConversation replay completed');
        await this.printMemorySnapshot();
    }

    /**
     * Set the delay between messages during replay
     */
    setReplayDelay(milliseconds: number): void {
        this.replayDelay = milliseconds;
    }
}
