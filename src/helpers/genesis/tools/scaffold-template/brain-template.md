---
name: "${name}"
role: "${role}"
goal: "${goal}"
capabilities: "${capabilities}"
instructions:
    $(agent_domain_instructions)
    #usetools: "instructions/usetools.md"
    clarification: "instructions/clarification.md"
    confirmation: "instructions/confirmation.md"
    exception: "instructions/exception.md"
    general: "instructions/general.md"    
---