// agent-manifest.ts

import { createRuntime } from '../../../runtime';

const runtime = createRuntime();

interface AgentManifestEntry {
    name: string;
    directory: string;
    createdAt: string;
}

interface AgentManifest {
    agents: Record<string, AgentManifestEntry[]>;
}

export class AgentManifestManager {
    private manifestPath: string;

    constructor(baseDir: string) {
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
     * @returns A unique directory name for the agent
     */
    public async generateUniqueName(agentName: string): Promise<string> {
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
        // Sanitize agent name to be filesystem-friendly
        const sanitizedName = agentName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
        const uniqueName = `${sanitizedName}-${timestamp}-${random}`;

        // Update manifest
        const manifest = await this.loadManifest();
        if (!manifest.agents[agentName]) {
            manifest.agents[agentName] = [];
        }

        const entry: AgentManifestEntry = {
            name: agentName,
            directory: uniqueName,
            createdAt: new Date().toISOString()
        };

        manifest.agents[agentName].push(entry);
        await this.saveManifest(manifest);

        return uniqueName;
    }

    /**
     * Gets all instances of an agent by name
     * @param agentName The agent name to look up
     * @returns Array of agent instances, ordered by creation time
     */
    public async getAgentInstances(agentName: string): Promise<AgentManifestEntry[]> {
        const manifest = await this.loadManifest();
        return manifest.agents[agentName] || [];
    }

    /**
     * Gets the most recently created instance of an agent
     * @param agentName The agent name to look up
     * @returns The latest agent instance, or null if none exists
     */
    public async getLatestInstance(agentName: string): Promise<AgentManifestEntry | null> {
        const instances = await this.getAgentInstances(agentName);
        return instances.length > 0 ? instances[instances.length - 1] : null;
    }
}