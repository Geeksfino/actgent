import { ClassificationTypeConfig } from '@finogeeks/actgent';
import { createAgent } from '../utils';

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

export const { agent: uiDesignerAgent, name: uiDesignerName } = createAgent(
    "UIDesignerAgent",
    "UI/UX Designer",
    "Create UI/UX designs",
    "UI/UX design, wireframing",
    uiDesignerTypes
);