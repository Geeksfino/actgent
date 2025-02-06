import { ConversationEmulator } from './ConversationEmulator';
import path from 'path';
import { logger, LogLevel } from '../../../src/core/Logger';

async function main() {
    const mainLogger = logger.withContext({ 
        module: 'test',
        component: 'main',
        tags: ['memory-framework']
    });

    // Enable debug logging
    logger.setLevel(LogLevel.DEBUG);

    const emulator = new ConversationEmulator();
    const conversationPath = path.join(__dirname, '../data/conversationHistory.json');
    
    mainLogger.info('Loading conversation history');
    await emulator.loadConversationHistory(conversationPath);
    
    mainLogger.info('Starting replay');
    await emulator.replayConversation();
}

main().catch(error => {
    const mainLogger = logger.withContext({ 
        module: 'test',
        component: 'main',
        tags: ['memory-framework']
    });
    mainLogger.error('Error in conversation emulation', { error });
    process.exit(1);
});
