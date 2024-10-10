import { ClassificationTypeConfig, AgentBuilder, AgentServiceConfigurator, AgentCoreConfig } from '@finogeeks/actgent';

const uiDesignerTypes: ClassificationTypeConfig[] = [
    {
        name: "UI_DESIGN",
        prompt: "Create a UI/UX design based on the user stories and system architecture.",
        schema: {
            design: {
                wireframes: ["<WIREFRAME_1_DESCRIPTION>", "<WIREFRAME_2_DESCRIPTION>"],
                colorScheme: "<COLOR_SCHEME>",
                components: ["<COMPONENT_1_DESCRIPTION>", "<COMPONENT_2_DESCRIPTION>"],
            },
        },
    },
];

const uiDesignerCoreConfig: AgentCoreConfig = {
    name: "UIDesignerAgent",
    role: "UI/UX Designer",
    goal: "Create UI/UX designs",
    capabilities: "UI/UX design, wireframing",
};

const svcConfig = AgentServiceConfigurator.getAgentConfiguration("test/multi-agents");
const agentBuilder = new AgentBuilder(uiDesignerCoreConfig, svcConfig);
export const uiDesignerAgent = agentBuilder.build("UIDesignerAgent", uiDesignerTypes);