enum PayloadType {
  TEXT = 'text',
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  FILE = 'file'
};

class Message {
  private id: string;
  private payload: {
    input: string;
    inputType: PayloadType;
    parameters: Record<string, any>;
    context: Record<string, any>;
  };
  private metadata?: {
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

  toJSON() {
    return {
      id: this.id,
      payload: this.payload,
      metadata: this.metadata,
    };
  }
}

export { Message };
