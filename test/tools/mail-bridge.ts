// mailBridge.ts
import { readFileSync } from 'fs';
import path from 'path';

interface EmailAttachment {
  name: string;
  path: string;
}

interface EmailMessage {
  id: string;
  subject: string;
  sender: string;
  recipients: string[];
  dateSent: string;
  dateReceived: string;
  content: string;
  wasRepliedTo: boolean;
  flagIndex: number;
  attachments: EmailAttachment[];
}

interface FetchOptions {
  unreadOnly?: boolean;
  since?: Date;
  mailbox?: string;
  limit?: number;
}

class MailBridge {
  private readonly applescript: string;

  constructor() {
    // Resolve path relative to the current file
    const scriptPath = path.join(import.meta.dir, '..', '..', 'src', 'tools', 'scripts', 'mail-fetch.applescript');
    this.applescript = readFileSync(scriptPath, 'utf-8');
  }

  /**
   * Executes an AppleScript command and returns the result
   */
  private async executeScript(script: string): Promise<string> {
    const proc = Bun.spawn(['osascript', '-e', script], {
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const output = await new Response(proc.stdout).text();
    const error = await new Response(proc.stderr).text();

    if (error) {
        console.error("AppleScript execution error:", error); // Log error for further inspection
        throw new Error(`AppleScript error: ${error}`);
      }

    return output;
  }

  /**
   * Fetches emails from Mail.app
   */
  async fetchEmails(options: FetchOptions = {}): Promise<EmailMessage[]> {
    try {
      const script = this.modifyScriptWithOptions(this.applescript, options);
      const output = await this.executeScript(script);
      return JSON.parse(output);
    } catch (error) {
      console.error('Error fetching emails:', error);
      throw error;
    }
  }

  /**
   * Modifies the base AppleScript based on provided options
   */
  private modifyScriptWithOptions(baseScript: string, options: FetchOptions): string {
    let script = baseScript;
    
    if (options.unreadOnly) {
      script = script.replace(
        'set targetMessages to messages of inbox',
        'set targetMessages to (messages of inbox where read status is false)'
      );
    }
    
    if (options.since) {
      const dateString = options.since.toISOString();
      script = script.replace(
        'set targetMessages to messages of inbox',
        `set targetMessages to (messages of inbox where date received > date "${dateString}")`
      );
    }

    if (options.mailbox) {
      script = script.replace(
        'messages of inbox',
        `messages of mailbox "${options.mailbox}"`
      );
    }

    if (options.limit) {
      script = script.replace(
        'set targetMessages to',
        `set targetMessages to (first ${options.limit} of`
      );
      script = script.replace(
        'messages of',
        'messages of) of'
      );
    }

    return script;
  }

  /**
   * Marks an email as read
   */
  async markAsRead(messageId: string): Promise<void> {
    const script = `
      tell application "Mail"
        set theMessage to first message of inbox where id = "${messageId}"
        set read status of theMessage to true
      end tell
    `;
    
    await this.executeScript(script);
  }

  /**
   * Moves an email to a specified mailbox
   */
  async moveToMailbox(messageId: string, mailboxName: string): Promise<void> {
    const script = `
      tell application "Mail"
        set theMessage to first message of inbox where id = "${messageId}"
        set targetMailbox to mailbox "${mailboxName}" of inbox
        move theMessage to targetMailbox
      end tell
    `;
    
    await this.executeScript(script);
  }

  /**
   * Archives an email
   */
  async archiveEmail(messageId: string): Promise<void> {
    const script = `
      tell application "Mail"
        set theMessage to first message of inbox where id = "${messageId}"
        archive theMessage
      end tell
    `;

    await this.executeScript(script);
  }
}

// Example agent class using the bridge
class EmailAgent {
  private mailBridge: MailBridge;
  private isProcessing: boolean;

  constructor() {
    this.mailBridge = new MailBridge();
    this.isProcessing = false;
  }

  /**
   * Process new emails with the agent
   */
  async processNewEmails() {
    if (this.isProcessing) return;
    
    try {
      this.isProcessing = true;
      
      // Get unread emails from the last hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const emails = await this.mailBridge.fetchEmails({
        unreadOnly: true,
        since: oneHourAgo,
        limit: 50 // Process in batches
      });

      console.log(`Processing ${emails.length} new emails`);

      for (const email of emails) {
        await this.analyzeEmail(email);
        await this.mailBridge.markAsRead(email.id);
      }
    } catch (error) {
      console.error('Error processing emails:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Example method to analyze an email with your agent
   */
  private async analyzeEmail(email: EmailMessage) {
    // Your agent's email processing logic here
    console.log(`Processing email: ${email.subject}`);
    
    // Example: Move emails with attachments to a specific folder
    if (email.attachments.length > 0) {
      await this.mailBridge.moveToMailbox(email.id, "Attachments");
    }
  }

  /**
   * Start the agent's email monitoring
   */
  async start(intervalMinutes: number = 5) {
    console.log('Starting email agent...');
    
    // Process emails on an interval
    setInterval(() => this.processNewEmails(), intervalMinutes * 60 * 1000);
    
    // Initial processing
    await this.processNewEmails();
  }
}

// Example usage with top-level await (supported by Bun)
try {
  const agent = new EmailAgent();
  await agent.start();
} catch (error) {
  console.error('Failed to start email agent:', error);
}