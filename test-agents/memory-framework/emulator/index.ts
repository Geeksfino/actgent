import { ConversationEmulator } from './ConversationEmulator';
import path from 'path';
import { logger, LogLevel } from '../../../src/core/Logger';

async function main() {
    // Enable debug logging
    logger.setLevel(LogLevel.DEBUG);

    const emulator = new ConversationEmulator();
    const conversationPath = path.join(__dirname, '../data/conversationHistory.json');
    
    logger.info('Loading conversation history');
    await emulator.loadConversationHistory(conversationPath);
    
    logger.info('Starting replay');
    await emulator.replayConversation();
}

main().catch(error => {
    logger.error('Error in conversation emulation', { error });
    process.exit(1);
});
