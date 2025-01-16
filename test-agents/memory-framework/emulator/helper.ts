import { AgentMemorySystem } from '../../../src/core/memory/AgentMemorySystem';
import { MemoryType } from '../../../src/core/memory/base';

interface ColumnWidths {
    timestamp: number;
    role: number;
    content: number;
}

export class TableFormatter {
    private readonly columnWidths: ColumnWidths = {
        timestamp: 24,  // Width for ISO timestamp
        role: 10,      // Fixed width for role
        content: 80    // Content width
    };

    private getStringWidth(str: string): number {
        let width = 0;
        for (let i = 0; i < str.length; i++) {
            const code = str.charCodeAt(i);
            // Check if character is a full-width character (CJK, emoji, etc.)
            if (
                (code >= 0x3000 && code <= 0x9FFF) ||    // CJK Unified Ideographs
                (code >= 0xFF00 && code <= 0xFFEF) ||    // Full-width forms
                (code >= 0x20000 && code <= 0x2A6DF) ||  // CJK Unified Ideographs Extension B
                (code >= 0x2A700 && code <= 0x2B73F) ||  // CJK Unified Ideographs Extension C
                (code >= 0x2B740 && code <= 0x2B81F) ||  // CJK Unified Ideographs Extension D
                (code >= 0x2F800 && code <= 0x2FA1F)     // CJK Compatibility Ideographs Supplement
            ) {
                width += 2;
            } else {
                width += 1;
            }
        }
        return width;
    }

    private padString(str: string, width: number): string {
        const strWidth = this.getStringWidth(str);
        const padding = width - strWidth;
        return str + ' '.repeat(Math.max(0, padding));
    }

    private wordWrap(text: string, width: number): string[] {
        // Try to parse and format JSON content
        let formattedText = text;
        try {
            if (text.trim().startsWith('{')) {
                const obj = JSON.parse(text);
                formattedText = JSON.stringify(obj, null, 2);
            }
        } catch {
            formattedText = text;
        }

        const lines: string[] = [];
        const rawLines = formattedText.split('\n');

        for (const rawLine of rawLines) {
            // If line fits, add it directly
            if (this.getStringWidth(rawLine) <= width) {
                lines.push(rawLine.replace(/\s+$/, '')); // Remove trailing spaces
                continue;
            }

            let remainingText = rawLine;
            while (remainingText.length > 0) {
                // If remaining text fits, add it and break
                if (this.getStringWidth(remainingText) <= width) {
                    lines.push(remainingText.replace(/\s+$/, '')); // Remove trailing spaces
                    break;
                }

                // Calculate effective width considering indentation
                const hasLeadingSpace = remainingText.match(/^\s+/);
                const leadingSpaces = hasLeadingSpace ? hasLeadingSpace[0] : '';
                const effectiveWidth = width - leadingSpaces.length;

                // Try to find a break point that fits within the width
                let splitIndex = remainingText.length;
                let currentWidth = 0;
                let lastSpaceIndex = -1;

                for (let i = 0; i < remainingText.length; i++) {
                    if (remainingText[i] === ' ') {
                        lastSpaceIndex = i;
                    }
                    currentWidth += this.getStringWidth(remainingText[i]);
                    if (currentWidth > effectiveWidth) {
                        splitIndex = i;
                        break;
                    }
                }

                // Prefer breaking at space if available and within width
                if (lastSpaceIndex !== -1 && lastSpaceIndex < splitIndex) {
                    splitIndex = lastSpaceIndex;
                }

                if (splitIndex === remainingText.length) {
                    // Entire remaining text fits
                    lines.push(remainingText.replace(/\s+$/, ''));
                    break;
                } else {
                    // Need to split
                    const line = remainingText.slice(0, splitIndex).replace(/\s+$/, '');
                    lines.push(line);
                    remainingText = leadingSpaces + remainingText.slice(splitIndex).trim();
                }
            }
        }

        // Final cleanup to ensure no line exceeds width
        return lines.map(line => {
            // Remove any trailing whitespace or unwanted characters
            line = line.replace(/[\s|-|│]+$/, '');
            
            // If line is still too wide, truncate it
            while (this.getStringWidth(line) > width) {
                line = line.slice(0, -1).replace(/[\s|-|│]+$/, '');
            }
            return line;
        });
    }

    private formatTableRow(timestamp: string, role: string, content: string): string[] {
        // Subtract 2 for the padding spaces around content
        const wrappedLines = this.wordWrap(content, this.columnWidths.content - 2);
        const rows: string[] = [];
        
        // First line with timestamp and role
        rows.push(
            '│ ' + this.padString(timestamp, this.columnWidths.timestamp) + ' │ ' +
            this.padString(role, this.columnWidths.role) + ' │ ' +
            this.padString(wrappedLines[0], this.columnWidths.content - 2) + ' │'
        );
        
        // Remaining lines with empty timestamp and role columns
        for (let i = 1; i < wrappedLines.length; i++) {
            rows.push(
                '│ ' + ' '.repeat(this.columnWidths.timestamp) + ' │ ' +
                ' '.repeat(this.columnWidths.role) + ' │ ' +
                this.padString(wrappedLines[i], this.columnWidths.content - 2) + ' │'
            );
        }
        
        return rows;
    }

    async printMemorySnapshot(memorySystem: AgentMemorySystem, messageCount: number) {
        const memories = await memorySystem.recall({
            types: [MemoryType.EPHEMERAL]
        });

        if (memories.length > 0) {
            console.log(`\n=== Memory Snapshot After Message ${messageCount} ===`);
            console.log(`Total Memories: ${memories.length}\n`);

            // Print table header
            console.log('┌' + '─'.repeat(this.columnWidths.timestamp + 2) + '┬' + 
                       '─'.repeat(this.columnWidths.role + 2) + '┬' + 
                       '─'.repeat(this.columnWidths.content) + '┐');

            // Print column headers with consistent spacing
            console.log(
                '│ ' + this.padString('Timestamp', this.columnWidths.timestamp) + ' │ ' +
                this.padString('Role', this.columnWidths.role) + ' │ ' +
                this.padString('Content', this.columnWidths.content - 2) + ' │'
            );

            console.log('├' + '─'.repeat(this.columnWidths.timestamp + 2) + '┼' + 
                       '─'.repeat(this.columnWidths.role + 2) + '┼' + 
                       '─'.repeat(this.columnWidths.content) + '┤');

            // Sort memories by timestamp
            const sortedMemories = memories.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

            // Print each memory
            for (const memory of sortedMemories) {
                const content = typeof memory.content === 'string' 
                    ? memory.content 
                    : JSON.stringify(memory.content);

                const rows = this.formatTableRow(
                    memory.timestamp.toISOString(),
                    memory.metadata?.get('role')?.toUpperCase() || 'UNKNOWN',
                    content
                );

                rows.forEach(row => console.log(row));
            }

            // Print table footer with consistent spacing
            console.log('└' + '─'.repeat(this.columnWidths.timestamp + 2) + '┴' + 
                       '─'.repeat(this.columnWidths.role + 2) + '┴' + 
                       '─'.repeat(this.columnWidths.content) + '┘');
        }
    }
}
