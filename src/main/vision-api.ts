export type VisionAttachmentKind = 'image' | 'file';

export interface VisionAttachment {
  id: string;
  name: string;
  kind: VisionAttachmentKind;
  source: 'screenshot' | 'upload';
  mimeType: string;
  base64: string;
  width?: number;
  height?: number;
}

export interface VisionChatHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export interface VisionPhaseEvent {
  type: 'phase';
  phase: 'uploading' | 'parsing' | 'streaming';
}

export interface VisionChunkEvent {
  type: 'chunk';
  content: string;
}

export interface VisionDoneEvent {
  type: 'done';
  timestamp?: string;
}

export interface VisionErrorEvent {
  type: 'error';
  message: string;
}

export type VisionStreamEvent = VisionPhaseEvent | VisionChunkEvent | VisionDoneEvent | VisionErrorEvent;

interface VisionChatPayload {
  message: string;
  attachments: VisionAttachment[];
  history: VisionChatHistoryItem[];
}

interface VisionTranscriptPayload {
  prompt?: string;
  attachments: VisionAttachment[];
}

export class VisionApiClient {
  constructor(private readonly serverUrl: string) {}

  async streamVisionChat(
    payload: VisionChatPayload,
    onEvent: (event: VisionStreamEvent) => void,
  ): Promise<void> {
    await this.stream('/vision/stream', payload, onEvent);
  }

  async streamTranscript(
    payload: VisionTranscriptPayload,
    onEvent: (event: VisionStreamEvent) => void,
  ): Promise<void> {
    await this.stream('/vision/transcript', payload, onEvent);
  }

  private async stream(
    endpoint: string,
    payload: VisionChatPayload | VisionTranscriptPayload,
    onEvent: (event: VisionStreamEvent) => void,
  ): Promise<void> {
    const response = await fetch(`${this.serverUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await safeReadResponseText(response);
      throw new Error(`Vision server returned ${response.status}: ${errorText}`);
    }

    if (!response.body) {
      throw new Error('Vision stream response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        parseSseLine(line, onEvent);
      }
    }

    buffer += decoder.decode();
    if (buffer.trim().length > 0) {
      for (const line of buffer.split('\n')) {
        parseSseLine(line, onEvent);
      }
    }
  }
}

function parseSseLine(line: string, onEvent: (event: VisionStreamEvent) => void): void {
  if (!line.startsWith('data: ')) {
    return;
  }

  const jsonStr = line.slice(6).trim();
  if (!jsonStr) {
    return;
  }

  try {
    const parsed = JSON.parse(jsonStr) as VisionStreamEvent;
    onEvent(parsed);
  } catch (error) {
    console.error('Failed to parse vision SSE line:', error);
  }
}

async function safeReadResponseText(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.trim() || '(empty response body)';
  } catch {
    return '(unavailable response body)';
  }
}
