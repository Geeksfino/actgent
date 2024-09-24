enum PayloadType {
  TEXT = 'text',
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  FILE = 'file'
};

class Message {
  private id: string;
  public payload: {
    input: string;
    inputType: PayloadType;
    parameters: Record<string, any>;
    context: Record<string, any>;
  };
  public metadata?: {
    sender: string;
    timestamp: string;
    priority: string;
    correlationId: string | null;
  };

  constructor(
    content: string,
    inputType = "text",
    parameters = {},
    context = {},
    sender = "Unknown",
    priority = "normal",
    correlationId = null
) {
    this.id = crypto.randomUUID();
    this.payload = {
      input: content,
      inputType: inputType as PayloadType,
      parameters: parameters,
      context: context,
    };
    this.metadata = {
      sender: sender,
      timestamp: new Date().toISOString(),
      priority: priority,
      correlationId: correlationId,
    };
  }

  public static isValidMessage(content: any): content is Message {
    return (
      typeof content.input === 'string' &&
      typeof content.inputType === 'string' &&
      Array.isArray(content.parameters) &&
      typeof content.context === 'object' &&
      typeof content.sender === 'string' &&
      typeof content.priority === 'number' &&
      typeof content.correlationId === 'string'
    );
  }

  public static fromJSON(json: string): Message {
    const message = JSON.parse(json);
    return new Message(message.payload.input, message.payload.inputType, message.payload.parameters, message.payload.context, message.metadata.sender, message.metadata.priority, message.metadata.correlationId);
  }

  toJSON() {
    return {
      id: this.id,
      payload: this.payload,
      metadata: this.metadata,
    };
  }
}

export { Message };
