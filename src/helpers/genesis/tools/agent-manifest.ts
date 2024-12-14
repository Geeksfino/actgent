// agent-manifest.ts

import { createRuntime } from '../../../runtime';
import { v4 as uuidv4 } from 'uuid';

const runtime = createRuntime();

interface AgentManifestEntry {
    name: string;
    directory: string;
    createdAt: string;
    role: string;
    goal: string;
    agent_id: string;
}

interface AgentManifest {
    agents: Record<string, AgentManifestEntry>;  // Directory name -> Single entry
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
     * @param agent_id The agent's ID
     * @returns A unique directory name for the agent
     */
    public async generateUniqueName(agentName: string, role: string = '', goal: string = '', agent_id: string): Promise<string> {
        const sanitizedName = agentName.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const uniqueName = `${sanitizedName}-${timestamp}-${random}`;

        const manifest = await this.loadManifest();
        
        // Create new entry
        manifest.agents[uniqueName] = {
            name: agentName,
            directory: uniqueName,
            createdAt: new Date().toISOString(),
            role,
            goal,
            agent_id: agent_id || uuidv4()
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
        const instances = Object.values(manifest.agents).filter(agent => agent.name === name);
        return instances.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    /**
     * Gets the most recently created instance of an agent
     * @param agentName The agent name to look up
     * @returns The latest agent instance, or null if none exists
     */
    public async getLatestInstance(agentName: string): Promise<AgentManifestEntry | null> {
        const instances = await this.getAgentInstances(agentName);
        if (instances.length === 0) return null;
        return instances[0];
    }

    /**
     * Gets an agent by its ID
     * @param agent_id The agent ID to look up
     * @returns The agent entry, or null if not found
     */
    public async getAgentById(agent_id: string): Promise<AgentManifestEntry | null> {
        const manifest = await this.loadManifest();
        const entries = Object.values(manifest.agents);
        return entries.find(entry => entry.agent_id === agent_id) || null;
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
        const manifest = await this.loadManifest();
        const newManifest: AgentManifest = { agents: {} };

        // Read all agent directories
        const entries = await runtime.fs.readDir(this.baseDir);
        
        for (const entry of entries) {
            const stats = await runtime.fs.stat(runtime.path.join(this.baseDir, entry));
            if (!stats.isDirectory) continue;

            // Check if this directory already exists in the current manifest
            const existingEntry = manifest.agents[entry];
            
            if (existingEntry) {
                // Keep existing entry
                newManifest.agents[entry] = existingEntry;
            } else {
                // Create new entry for unknown directory
                newManifest.agents[entry] = {
                    name: entry,
                    directory: entry,
                    createdAt: new Date(stats.modifiedAt).toISOString(),
                    role: '',
                    goal: '',
                    agent_id: uuidv4()
                };
            }
        }

        await this.saveManifest(newManifest);
        return newManifest;  // Return the new manifest
    }
}