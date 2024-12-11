// agent-manifest.ts

import { createRuntime } from '../../../runtime';

const runtime = createRuntime();

interface AgentManifestEntry {
    name: string;
    directory: string;
    createdAt: string;
    role: string;
    goal: string;
}

interface AgentManifest {
    agents: Record<string, AgentManifestEntry>;
}

export class AgentManifestManager {
    private manifestPath: string;
    private baseDir: string;

    constructor(baseDir: string) {
        this.baseDir = baseDir;
        this.manifestPath = runtime.path.join(baseDir, '.agent-manifest.json');
    }

    private async loadManifest(): Promise<AgentManifest> {
        try {
            const content = await runtime.fs.readFile(this.manifestPath, 'utf-8');
            return JSON.parse(content);
        } catch {
            return { agents: {} };
        }
    }

    private async saveManifest(manifest: AgentManifest): Promise<void> {
        await runtime.fs.writeFile(this.manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
    }

    /**
     * Generates a unique name for an agent and records it in the manifest.
     * @param agentName The original agent name
     * @param role The agent's role
     * @param goal The agent's goal
     * @returns A unique directory name for the agent
     */
    public async generateUniqueName(agentName: string, role: string = '', goal: string = ''): Promise<string> {
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
        // Sanitize agent name to be filesystem-friendly
        const sanitizedName = agentName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
        const uniqueName = `${sanitizedName}-${timestamp}-${random}`;

        // Update manifest
        const manifest = await this.loadManifest();
        manifest.agents[uniqueName] = {
            name: agentName,
            directory: uniqueName,
            createdAt: new Date().toISOString(),
            role,
            goal
        };
        await this.saveManifest(manifest);

        return uniqueName;
    }

    /**
     * Gets all instances of an agent by name
     * @param name The agent name to look up
     * @returns Array of agent instances, ordered by creation time
     */
    public async getAgentInstances(name: string): Promise<AgentManifestEntry[]> {
        const manifest = await this.loadManifest();
        return Object.values(manifest.agents).filter(agent => agent.name === name);
    }

    /**
     * Gets the most recently created instance of an agent
     * @param agentName The agent name to look up
     * @returns The latest agent instance, or null if none exists
     */
    public async getLatestInstance(agentName: string): Promise<AgentManifestEntry | null> {
        const instances = await this.getAgentInstances(agentName);
        if (instances.length === 0) return null;
        
        // Sort by creation time, newest first
        instances.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return instances[0];
    }

    /**
     * Gets the entire manifest
     * @returns The complete agent manifest
     */
    public async getManifest(): Promise<AgentManifest> {
        return await this.loadManifest();
    }

    /**
     * Scans the agents directory and rebuilds the manifest
     * @returns The updated manifest
     */
    public async reindexAgents(): Promise<AgentManifest> {
        const manifest: AgentManifest = { agents: {} };
        
        try {
            // Read all entries in the agents dir
            const entries = await runtime.fs.readDir(this.baseDir);
            
            for (const entryName of entries) {
                if (entryName.startsWith('.')) continue;
                
                const agentDir = runtime.path.join(this.baseDir, entryName);
                try {
                    // Check if it's a directory
                    const stats = await runtime.fs.stat(agentDir);
                    if (!stats.isDirectory) continue;

                    // Try to read and parse brain.md for agent info
                    const brainPath = runtime.path.join(agentDir, 'brain.md');
                    const brainContent = await runtime.fs.readFile(brainPath, 'utf-8');
                    
                    // Extract metadata section between --- markers
                    const metadataMatch = brainContent.match(/^---\n([\s\S]*?)\n---/);
                    if (!metadataMatch) continue;
                    
                    const metadata = metadataMatch[1].split('\n').reduce((acc, line) => {
                        const [key, value] = line.split(':').map(s => s.trim());
                        if (key && value) {
                            // Remove quotes if present
                            acc[key] = value.replace(/^"(.*)"$/, '$1');
                        }
                        return acc;
                    }, {} as Record<string, string>);
                    
                    const agentName = metadata.name;
                    if (!agentName) continue;
                    
                    manifest.agents[entryName] = {
                        name: agentName,
                        directory: entryName,
                        createdAt: new Date(stats.modifiedAt).toISOString(),
                        role: metadata.role || '',
                        goal: metadata.goal || ''
                    };
                } catch (error) {
                    console.error(`Error processing agent directory ${entryName}:`, error);
                    continue;
                }
            }
            
            // Save the rebuilt manifest
            await this.saveManifest(manifest);
            return manifest;
            
        } catch (error) {
            console.error('Error reindexing agents:', error);
            throw error;
        }
    }
}