#!/bin/bash

# Script to test function calling with different LLM providers
# Usage: ./test_models.sh <provider> <api_key> [model]

# Default values
PROVIDER=${1:-"openai"}
API_KEY=${2:-"your_api_key_here"}
MODEL=${3:-""}

# Function to show usage
show_usage() {
  echo "Usage: $0 <provider> <api_key> [model]"
  echo "Supported providers:"
  echo "  - openai (default model: gpt-4-turbo)"
  echo "  - together (default model: deepseek-ai/DeepSeek-V3)"
  echo "  - google (default model: gemini-2.0-flash)"
  echo "  - deepseek (default model: deepseek-chat)"
  echo ""
  echo "Example: $0 openai sk-abcdef123456 gpt-4-turbo"
  exit 1
}

# Check if help is requested
if [[ "$1" == "-h" || "$1" == "--help" ]]; then
  show_usage
fi

# Validate required parameters
if [[ -z "$API_KEY" || "$API_KEY" == "your_api_key_here" ]]; then
  echo "Error: API key is required"
  show_usage
fi

# Set provider-specific configurations
case "$PROVIDER" in
  "openai")
    API_URL="https://api.openai.com/v1/chat/completions"
    [[ -z "$MODEL" ]] && MODEL="gpt-4-turbo"
    PAYLOAD=$(cat <<EOF
{
  "model": "$MODEL",
  "messages": [
    {
      "role": "user",
      "content": "List directories I own"
    }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "list_allowed_directories",
        "description": "Lists directories owned by the current user",
        "parameters": {
          "type": "object",
          "properties": {},
          "required": []
        }
      }
    }
  ],
  "tool_choice": "auto"
}
EOF
)
    ;;
    
  "together")
    API_URL="https://api.together.xyz/v1/chat/completions"
    [[ -z "$MODEL" ]] && MODEL="deepseek-ai/DeepSeek-V3"
    PAYLOAD=$(cat <<EOF
{
  "model": "$MODEL",
  "messages": [
    {
      "role": "user",
      "content": "List directories I own"
    }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "list_allowed_directories",
        "description": "Lists directories owned by the current user",
        "parameters": {
          "type": "object",
          "properties": {},
          "required": []
        }
      }
    }
  ],
  "tool_choice": "auto"
}
EOF
)
    ;;
    
  "google")
    API_URL="https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
    [[ -z "$MODEL" ]] && MODEL="gemini-2.0-flash"
    PAYLOAD=$(cat <<EOF
{
  "model": "$MODEL",
  "messages": [
    {
      "role": "user",
      "content": "List directories I own"
    }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "list_allowed_directories",
        "description": "Lists directories owned by the current user",
        "parameters": {
          "type": "object",
          "properties": {},
          "required": []
        }
      }
    }
  ],
  "tool_choice": "auto"
}
EOF
)
    ;;
    
  "deepseek")
    API_URL="https://api.deepseek.com/chat/completions"
    [[ -z "$MODEL" ]] && MODEL="deepseek-chat"
    PAYLOAD=$(cat <<EOF
{
  "model": "$MODEL",
  "messages": [
    {
      "role": "user",
      "content": "List directories I own"
    }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "list_allowed_directories",
        "description": "Lists directories owned by the current user",
        "parameters": {
          "type": "object",
          "properties": {},
          "required": []
        }
      }
    }
  ]
}
EOF
)
    ;;
    
  *)
    echo "Error: Unsupported provider '$PROVIDER'"
    show_usage
    ;;
esac

# All providers use the same Bearer token approach
AUTH_HEADER="Authorization: Bearer ${API_KEY}"

# Print request details
echo "Provider: $PROVIDER"
echo "Model: $MODEL"
echo "API URL: $API_URL"
echo "Payload:"
echo "$PAYLOAD" | jq '.' 2>/dev/null || echo "$PAYLOAD"

# Execute the curl command
echo -e "\nSending request...\n"

# All providers use the same Authorization header format
RESPONSE=$(curl -s "$API_URL" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d "$PAYLOAD")

# Print the response
echo -e "\nResponse:\n"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"

# Extract and analyze the tool call format
echo -e "\nAnalyzing tool call format:\n"

if [[ "$RESPONSE" == *"tool_calls"* ]]; then
  echo "OpenAI-compatible format detected (with tool_calls array)"
  TOOL_CALLS=$(echo "$RESPONSE" | jq -c '.choices[0].message.tool_calls' 2>/dev/null)
  echo "Tool calls: $TOOL_CALLS"
elif [[ "$RESPONSE" == *"\"name\":"* && "$RESPONSE" != *"\"id\":"* ]]; then
  echo "Simplified format detected (with name but no id)"
  NAME=$(echo "$RESPONSE" | jq -r '.choices[0].message.content | fromjson | .name' 2>/dev/null)
  echo "Tool name: $NAME"
else
  echo "Unknown format or no tool call detected"
fi