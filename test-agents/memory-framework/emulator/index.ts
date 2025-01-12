import { ConversationEmulator } from './ConversationEmulator';
import path from 'path';
import { logger } from '../../../src/core/Logger';

async function main() {
    const emulator = new ConversationEmulator();
    const conversationPath = path.join(__dirname, '../data/conversationHistory.json');
    
    logger.info('Loading conversation history');
    await emulator.loadConversation(conversationPath);
    
    logger.info('Starting replay');
    await emulator.replayConversation();
}

main().catch(error => {
    logger.error('Error in conversation emulation', { error });
    process.exit(1);
});
