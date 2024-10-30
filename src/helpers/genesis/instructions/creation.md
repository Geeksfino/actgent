---
instructionName: Creation
schemaTemplate: "creation.json"
tool: "AgentGenerator"
---
When creating an agent, first analyze the input description to extract the role, goal and capabilities of the agent to be created, then think about what kind of tasks will user ask such an agent to fulfil. Come up with a sample task which is typical and common. Take it as a complex task and decompose it into simple sub tasks. For each simple task, there will be a corresponding instruction to get the simple task done.

An instruction is a triplet of:

- instruction name: <this is a unique but meaningful string to identify the instruction>
- description of instruction: <a description of the scenario when this instruction shall be triggered. This will be used to construct a prompt later to submit to a large language model>
- output data schema template: <if this instruction, upon submitting as a prompt to a large language model, will result in some data output that is suitable to be returned in a JSON template or string template format, define such a template>

The logical relationship of these three elements in an instruction and optionally, a tool, shall reflect this: WHEN a user request is determined suitable to be handled by a named instruction as described, AND if it results in a structured response, THEN the response shall conform to the given schema. And this structured response shall be handled by the named tool, if present. Note both the schema and the tool are optional. Some instructions cause structural responses and some responses might need to be handled by corresponding tools.

Special notice:
- description of instruction needs to be as clear, concise and logical as possible, because it would be used to construct prompts for large language model to consume and understand
- output data schema template is optional. An instruction is allowed without a corresponding output schema template.

----------- example starts --------------
The agent to be created is a travel agent. Its goal is to help customer plan itinerary.

Before creating this agent, first analyze what needs to be done to reach the goal. Now think about a possible scenario when a customer ask this agent to "Help me plan the itinerary for a 5-days vacation in New York". In order to get this task done, this agent will need a few steps or routines, such as "propose a plan", "book a flight", "provide information", etc. These routines are typical and universally applicable to all similar customer requests, so they can be defined as instructions.

Each routine will be an instruction, which needs to be further expanded with detail description and possible response data format. Represent the data format as a schema with placeholders, such as:

        "daily_schedule": [
          {
            "date": "<YYYY-MM-DD>",
            "activities": [
              {
                "time": "<HH:MM>",
                "activity_name": "<activity_name>",
                "location": "<activity_location>",
                "description": "<activity_description>",
                "price": "<currency_value>"
              }
            ]
          }
		]

---------- example ends --------------

Do not make up instructions. Only create instructions for the agent based on its role, goal and capabilities. 
Do not allow definition of too many instructions. Only create an instruction when it is useful and mandatory. As a guideline, 1 to 5 instructions are reasonable.
When designing instructions, make sure they are mutually exclusive and collectively exhaustive with respect to completing given task under the given goal.

