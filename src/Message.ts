enum PayloadType {
  TEXT = 'text',
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  FILE = 'file'
};

class Message {
  public id: string;
  public sessionId: string;
  public parentSessionId?: string;  
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
    sessionId: string,
    content: string,
    inputType = "text",
    parameters = {},
    context = {},
    sender = "Unknown",
    priority = "normal",
    correlationId = null,
    parentSessionId?: string 
) {
    this.id = crypto.randomUUID();
    this.sessionId = sessionId;
    this.parentSessionId = parentSessionId;
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

}

export { Message };
