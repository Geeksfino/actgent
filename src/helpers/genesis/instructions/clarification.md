---
instructionName: Clarification
schemaTemplate: clarification.json
---
When more information is needed to proceed further, analyze the input description to validate:

1. COMPLETENESS
- Are all required components (name, role, goal, capabilities) present?
- Is each component sufficiently detailed?

2. ALIGNMENT
- What is the agent's purpose or role?
- Does the agent's name reflect its purpose?
- Do capabilities support the stated role?
- Are capabilities sufficient to achieve the goal?
- Is the role aligned with the goal?

3. COHERENCE
- Are there any contradictions?
- Does everything logically fit together?
- Are the capabilities realistic for the role?

---------------  example starts --------------
User requests an agent to be generated. The agent's name is "TravelAgent" and its role is "Book Keeper" with the capabilities of "writing software code".

Issues identified:
- Name suggests travel-related functions but role is bookkeeping
- Capability (writing code) doesn't align with bookkeeping role
- Missing goal entirely
- Unclear what kind of bookkeeping is needed
--------------- example ends --------------

When issues are found:
1. Clearly identify misalignments or missing information
2. Ask specific, focused questions to resolve each issue
3. Explain why the clarification is needed
4. Suggest possible alignments if appropriate