// test-models.ts
import { OpenAI } from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionTool, ChatCompletionToolChoiceOption } from 'openai/resources/chat/completions';

// Function to test DeepSeek API using OpenAI client
async function testDeepSeekAPI(apiKey: string) {
  // Create OpenAI client with DeepSeek API URL and key
  const client = new OpenAI({
    apiKey: apiKey,
    baseURL: 'https://api.deepseek.com',
  });

  // Define all the tools exactly as they appear in the AgentCore configuration
  const tools: ChatCompletionTool[] = [
    {
      type: 'function',
      function: {
        name: 'read_file',
        description: 'Read the complete contents of a file from the file system. Handles various text encodings and provides detailed error messages if the file cannot be read. Use this tool when you need to examine the contents of a single file. Only works within allowed directories.',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string'
            }
          },
          required: [
            'path'
          ]
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'read_multiple_files',
        description: 'Read the contents of multiple files simultaneously. This is more efficient than reading files one by one when you need to analyze or compare multiple files. Each file\'s content is returned with its path as a reference. Failed reads for individual files won\'t stop the entire operation. Only works within allowed directories.',
        parameters: {
          type: 'object',
          properties: {
            paths: {
              type: 'array',
              items: {
                type: 'string',
                description: ''
              }
            }
          },
          required: [
            'paths'
          ]
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'write_file',
        description: 'Create a new file or completely overwrite an existing file with new content. Use with caution as it will overwrite existing files without warning. Handles text content with proper encoding. Only works within allowed directories.',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string'
            },
            content: {
              type: 'string'
            }
          },
          required: [
            'path',
            'content'
          ]
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'edit_file',
        description: 'Make line-based edits to a text file. Each edit replaces exact line sequences with new content. Returns a git-style diff showing the changes made. Only works within allowed directories.',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string'
            },
            edits: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  oldText: {
                    type: 'string',
                    description: 'Text to search for - must match exactly'
                  },
                  newText: {
                    type: 'string',
                    description: 'Text to replace with'
                  }
                },
                required: [
                  'oldText',
                  'newText'
                ]
              }
            },
            dryRun: {
              type: 'boolean',
              description: 'Preview changes using git-style diff format'
            }
          },
          required: [
            'path',
            'edits'
          ]
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'create_directory',
        description: 'Create a new directory or ensure a directory exists. Can create multiple nested directories in one operation. If the directory already exists, this operation will succeed silently. Perfect for setting up directory structures for projects or ensuring required paths exist. Only works within allowed directories.',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string'
            }
          },
          required: [
            'path'
          ]
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'list_directory',
        description: 'Get a detailed listing of all files and directories in a specified path. Results clearly distinguish between files and directories with [FILE] and [DIR] prefixes. This tool is essential for understanding directory structure and finding specific files within a directory. Only works within allowed directories.',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string'
            }
          },
          required: [
            'path'
          ]
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'directory_tree',
        description: 'Get a recursive tree view of files and directories as a JSON structure. Each entry includes \'name\', \'type\' (file/directory), and \'children\' for directories. Files have no children array, while directories always have a children array (which may be empty). The output is formatted with 2-space indentation for readability. Only works within allowed directories.',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string'
            }
          },
          required: [
            'path'
          ]
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'move_file',
        description: 'Move or rename files and directories. Can move files between directories and rename them in a single operation. If the destination exists, the operation will fail. Works across different directories and can be used for simple renaming within the same directory. Both source and destination must be within allowed directories.',
        parameters: {
          type: 'object',
          properties: {
            source: {
              type: 'string'
            },
            destination: {
              type: 'string'
            }
          },
          required: [
            'source',
            'destination'
          ]
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'search_files',
        description: 'Recursively search for files and directories matching a pattern. Searches through all subdirectories from the starting path. The search is case-insensitive and matches partial names. Returns full paths to all matching items. Great for finding files when you don\'t know their exact location. Only searches within allowed directories.',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string'
            },
            pattern: {
              type: 'string'
            },
            excludePatterns: {
              type: 'array',
              items: {
                type: 'string',
                description: ''
              }
            }
          },
          required: [
            'path',
            'pattern'
          ]
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'get_file_info',
        description: 'Retrieve detailed metadata about a file or directory. Returns comprehensive information including size, creation time, last modified time, permissions, and type. This tool is perfect for understanding file characteristics without reading the actual content. Only works within allowed directories.',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string'
            }
          },
          required: [
            'path'
          ]
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'list_allowed_directories',
        description: 'Returns the list of directories that this server is allowed to access. Use this to understand which directories are available before trying to access files.',
        parameters: {
          type: 'object',
          properties: {},
          required: []
        }
      }
    }
  ];

  // Mimic the message structure from AgentCore.promptLLM with the exact same prompts
  const systemPrompt = "You are designated as: To chat with users and answer their questions.\nYour goal: Your goal is to provide helpful and accurate responses to users' questions.\nYour capabilities: Your capabilities are to use available tools to answer users' questions.";
  const assistantPrompt = "";
  
  // Simulate history from memory
  const history: ChatCompletionMessageParam[] = [
    // This would typically come from recallRecentMessages()
    // We're simulating an empty history here
  ];
  
  // Create the messages array exactly as in AgentCore.promptLLM
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },

    ...history,
    // This is the key part - the user message
    { role: "user", content: "List directories I own" },
  ];

  // Create the request configuration
  const config = {
    model: 'deepseek-chat',
    messages: messages,
    tools: tools,
    // Fix the tool_choice format to match OpenAI's expected format
    tool_choice: 'required' as ChatCompletionToolChoiceOption,
  };

  console.log('Sending request to DeepSeek API...');
  console.log('Request config:', JSON.stringify(config, null, 2));

  try {
    // Make the API call
    const response = await client.chat.completions.create(config);
    
    // Log the full response
    console.log('Full response:', JSON.stringify(response, null, 2));
    
    // Check if the response contains tool calls
    const message = response.choices[0].message;
    if (message.tool_calls && message.tool_calls.length > 0) {
      console.log('Tool calls detected:');
      console.log(JSON.stringify(message.tool_calls, null, 2));
    } else {
      console.log('No tool calls detected. Content:');
      console.log(message.content);
    }
  } catch (error) {
    console.error('Error calling DeepSeek API:', error);
  }
}

// Get API key from command line arguments
const apiKey = process.argv[2];

if (!apiKey) {
  console.error('Please provide your DeepSeek API key as a command line argument');
  console.error('Usage: bun run examples/test-models.ts YOUR_API_KEY');
  process.exit(1);
}

// Run the test with the provided API key
testDeepSeekAPI(apiKey).catch(console.error);