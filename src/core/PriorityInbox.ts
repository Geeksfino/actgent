import { Message } from "./Message";
import Bottleneck from "bottleneck";
import { interval, from } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { Subject, Subscription } from 'rxjs';

export class PriorityInbox {
    private limiter: Bottleneck;
    private pendingMessages: number; // Tracks the number of pending messages
    private messageQueue: Message[]; 
    private processMessage: (message: Message) => Promise<void>;
    private subscription: Subscription | null = null;

    constructor() {
        this.pendingMessages = 0; // Initialize with no pending messages
        this.messageQueue = [];
        this.processMessage = this.defaultProcessMessage;
        // Initialize Bottleneck with desired settings
        this.limiter = new Bottleneck({
            maxConcurrent: 1, // Only one message processed at a time
            minTime: 100,     // Minimum time between tasks in milliseconds
        });
    }

    public init(processMessage: (message: Message) => Promise<void>): void {
        this.processMessage = processMessage;
        this.subscription = interval(1000).pipe(
            switchMap(() => from(this.checkPriorityInbox()))
        ).subscribe();
    }

    public stop(): void {
        if (this.subscription) {
            this.subscription.unsubscribe();
            this.subscription = null;
        }
    }

    private async checkPriorityInbox(): Promise<string> {
        //console.log('Checking priority inbox...');
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve('Inbox checked');
            const message: Message | null = this.dequeue();
            if (message) {
              this.processMessage(message);
            }
          }, 1000);
        });
    }

    enqueue(message: Message, priority = 'normal') {
        // Increase the pending message count
        this.pendingMessages++;
        this.messageQueue.push(message);
        // Map priority levels to numbers (0: high, 1: normal, 2: low)
        const priorityValue = this.getPriorityValue(priority);

        // this.limiter.schedule({ priority: priorityValue }, async () => {
        //     await this.processMessage(message);
        // }).finally(() => {
        //     // Decrease the pending message count once the message is processed
        //     this.pendingMessages--;
        // });
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

    private async defaultProcessMessage(message: Message): Promise<void> {
        // Implement message processing logic here
        console.log('PriorityInbox Processing message:', message);
    }
}
