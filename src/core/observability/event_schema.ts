// This file exports the event schema as a TypeScript object
// to avoid issues with direct JSON imports

const eventSchema = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "LLM Agent Observability Event Schema",
  "description": "Schema for monitoring and observing LLM agent behavior and performance",
  "$defs": {
    "eventTypes": {
      "type": "string",
      "enum": [
        "GENERAL",
        "TASK_STARTED",
        "TASK_COMPLETED",
        "PROMPT_GENERATED",
        "STRATEGY_SELECTION",
        "STRATEGY_SWITCH",
        "LLM_REQUEST",
        "LLM_RESPONSE",
        "TOOL_STARTED",
        "TOOL_COMPLETED",
        "TOOL_ERROR",
        "CONTEXT_SWITCH",
        "MEMORY_ACCESS"
      ]
    },
    "strategyTypes": {
      "type": "string",
      "enum": [
        "DIRECT",
        "PLAN_AND_EXECUTE",
        "RECURSIVE_TASK_DECOMPOSITION",
        "REACT"
      ]
    }
  },
  "properties": {
    "eventId": {
      "type": "string",
      "description": "Unique identifier for the event"
    },
    "eventType": {
      "$ref": "#/$defs/eventTypes"
    },
    "timestamp": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 timestamp when the event occurred"
    },
    "data": {
      "type": "object",
      "properties": {
        "taskInfo": {
          "type": "object",
          "properties": {
            "taskId": { "type": "string" },
            "taskName": { "type": "string" },
            "taskDescription": { "type": "string" },
            "parentTaskId": { "type": "string" },
            "status": { 
              "type": "string",
              "enum": ["PENDING", "IN_PROGRESS", "COMPLETED", "FAILED", "CANCELLED"]
            },
            "priority": {
              "type": "string",
              "enum": ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
            },
            "complexity": {
              "type": "number",
              "minimum": 0,
              "maximum": 10
            },
            "startTime": { "type": "string", "format": "date-time" },
            "endTime": { "type": "string", "format": "date-time" },
            "duration": { "type": "number" },
            "dependencies": {
              "type": "array",
              "items": { "type": "string" }
            },
            "tags": {
              "type": "array",
              "items": { "type": "string" }
            }
          }
        },
        "strategyInfo": {
          "type": "object",
          "properties": {
            "strategyType": { "$ref": "#/$defs/strategyTypes" },
            "strategyName": { "type": "string" },
            "strategyDescription": { "type": "string" },
            "reasonForSelection": { "type": "string" },
            "reasonForSwitch": { "type": "string" },
            "previousStrategy": { "$ref": "#/$defs/strategyTypes" }
          }
        },
        "llmInfo": {
          "type": "object",
          "properties": {
            "modelId": { "type": "string" },
            "requestTokens": { "type": "integer" },
            "responseTokens": { "type": "integer" },
            "totalTokens": { "type": "integer" },
            "promptTemplate": { "type": "string" },
            "promptVariables": { "type": "object" },
            "temperature": { "type": "number" },
            "topP": { "type": "number" },
            "maxTokens": { "type": "integer" },
            "responseTime": { "type": "number" },
            "requestId": { "type": "string" },
            "errorMessage": { "type": "string" }
          }
        },
        "toolInfo": {
          "type": "object",
          "properties": {
            "toolId": { "type": "string" },
            "toolName": { "type": "string" },
            "toolDescription": { "type": "string" },
            "toolParameters": { "type": "object" },
            "toolResult": { "type": "object" },
            "toolError": { "type": "string" },
            "executionTime": { "type": "number" }
          }
        },
        "memoryInfo": {
          "type": "object",
          "properties": {
            "memoryId": { "type": "string" },
            "memoryType": { 
              "type": "string",
              "enum": ["EPISODIC", "SEMANTIC", "PROCEDURAL", "WORKING"]
            },
            "operation": {
              "type": "string",
              "enum": ["READ", "WRITE", "UPDATE", "DELETE", "SEARCH"]
            },
            "query": { "type": "string" },
            "content": { "type": "object" },
            "retrievalTime": { "type": "number" },
            "relevanceScore": { "type": "number" }
          }
        },
        "reasoningInfo": {
          "type": "object",
          "properties": {
            "analysis": { "type": "string" },
            "plan": { 
              "type": "array",
              "items": { "type": "string" }
            },
            "thoughts": { "type": "string" },
            "next_steps": {
              "type": "array",
              "items": { "type": "string" }
            },
            "expectation": { "type": "string" },
            "review": { "type": "string" },
            "suggestions": {
              "type": "array",
              "items": { "type": "string" }
            }
          }
        }
      }
    },
    "metadata": {
      "type": "object",
      "properties": {
        "version": { "type": "string" },
        "environment": { "type": "string" },
        "source": { "type": "string" },
        "tags": {
          "type": "array",
          "items": { "type": "string" }
        }
      }
    }
  }
};

export default eventSchema;
