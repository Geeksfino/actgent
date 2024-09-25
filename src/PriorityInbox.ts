import { Message } from "./Message";
import Bottleneck from "bottleneck";

export class PriorityInbox {
    private limiter: Bottleneck;
    private pendingMessages: number; // Tracks the number of pending messages
    private messageQueue: Message[]; 

    constructor() {
        this.pendingMessages = 0; // Initialize with no pending messages
        this.messageQueue = [];

        // Initialize Bottleneck with desired settings
        this.limiter = new Bottleneck({
            maxConcurrent: 1, // Only one message processed at a time
            minTime: 100,     // Minimum time between tasks in milliseconds
        });
    }

    enqueue(message: Message, priority = 'normal') {
        // Increase the pending message count
        this.pendingMessages++;
        this.messageQueue.push(message);
        // Map priority levels to numbers (0: high, 1: normal, 2: low)
        const priorityValue = this.getPriorityValue(priority);

        // Schedule the message processing with a priority
        this.limiter.schedule({ priority: priorityValue }, async () => {
            await this.processMessage(message);
        }).finally(() => {
            // Decrease the pending message count once the message is processed
            this.pendingMessages--;
        });
    }

    dequeue(): Message | null {
      return this.messageQueue.length > 0 ? this.messageQueue.shift() || null : null;
    }
    hasPendingMessages(): boolean {
        return this.pendingMessages > 0;
    }

    size(): number {
        return this.messageQueue.length;
    }

    private getPriorityValue(priority: string) {
        switch (priority) {
            case 'high':
                return 0;
            case 'low':
                return 2;
            default:
                return 1; // Normal priority
        }
    }

    private async processMessage(message: Message) {
        // Implement message processing logic here
        console.log('Processing message:', message);
    }
}
