import { z } from 'zod';
import { GraphTask } from '../../types';

export class CommunityGraphProcessor {
    async process(task: GraphTask, data: any): Promise<any> {
        switch (task) {
            case GraphTask.REFINE_COMMUNITIES:
                console.log("REFINE_COMMUNITIES data: ", data);
                const refineCommunitiesPrompt = `Refine the following graph community (ID: ${data.community_id}) with members: ${JSON.stringify(data.nodes)}\n
                Guidelines:
                1. Analyze the community members and their connections.
                2. Identify any inconsistencies or inaccuracies in the community structure.
                3. Refine the community by adding or removing members as necessary.
                4. Provide a clear reason for any changes made.\n
                Required Output Format:              
                JSON object with:             
                - community_id: string              
                - updated_members: array of strings              
                - reason: string (optional)`;
                console.log("REFINE_COMMUNITIES prompt: ", refineCommunitiesPrompt);
                return {
                    prompt: refineCommunitiesPrompt,
                    functionSchema: z.object({
                        community_id: z.string(),
                        updated_members: z.array(z.string()),
                        reason: z.string().optional()
                    })
                };
            
            case GraphTask.LABEL_COMMUNITY:
                console.log("LABEL_COMMUNITY data: ", data);
                const labelCommunityPrompt = `Generate a descriptive label for this community of nodes:\n${JSON.stringify(data.nodes)}\nProvide a concise label and confidence score.`;
                console.log("LABEL_COMMUNITY prompt: ", labelCommunityPrompt);
                return {
                    prompt: labelCommunityPrompt,
                    functionSchema: z.object({
                        label: z.string(),
                        confidence: z.number().min(0).max(1)
                    })
                };
            default:
                throw new Error(`Task ${task} not supported`);
        }
    }
}
