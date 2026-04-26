type PreviewKind = 'markdown' | 'text' | 'unsupported';

interface ExplorerNode {
  name: string;
  path: string;
  kind: 'directory' | 'file';
  previewKind?: PreviewKind;
  children?: ExplorerNode[];
}

declare global {
  interface Window {
    ccApi: {
      sendStateUpdate: (state: { title: string; content: string }) => void;
      requestSave: () => void;
      requestClose: () => void;
      listFiles: () => Promise<{
        baseDir: string;
        defaultProjectName: string;
        nodes: ExplorerNode[];
      }>;
      updateStorageBaseDir: (baseDir: string) => Promise<{
        baseDir: string;
        defaultProjectName: string;
        nodes: ExplorerNode[];
      }>;
      readFile: (path: string) => Promise<{
        path: string;
        previewKind: PreviewKind;
        content: string;
      }>;
      sendAgentMessage: (input: {
        message: string;
        contextFiles: Array<{
          path: string;
          content: string;
          previewKind: PreviewKind;
        }>;
      }) => Promise<{
        role: 'agent';
        content: string;
        timestamp: string;
      }>;
      sendAgentMessageStream: (input: {
        message: string;
        contextFiles: Array<{
          path: string;
          content: string;
          previewKind: PreviewKind;
        }>;
      }) => Promise<void>;
      onAgentStreamChunk: (listener: (chunk: {
        type: 'chunk' | 'done' | 'error';
        content?: string;
        message?: string;
        timestamp?: string;
      }) => void) => () => void;
      onPresent: (listener: (payload: { text: string }) => void) => () => void;
      onFocusTitle: (listener: () => void) => () => void;
      onSaved: (listener: (payload: { path: string }) => void) => () => void;
      onToggleLeftSidebar: (listener: () => void) => () => void;
      onToggleRightSidebar: (listener: () => void) => () => void;
    };
    visionApi: {
      getState: () => Promise<Record<string, unknown>>;
      getChatState: () => Promise<Record<string, unknown>>;
      startNewSession: () => Promise<Record<string, unknown>>;
      requestScreenshot: () => Promise<Record<string, unknown>>;
      requestUploadFiles: () => Promise<Record<string, unknown>>;
      pasteClipboardImage: () => Promise<boolean>;
      removeAttachment: (index: number) => Promise<Record<string, unknown>>;
      sendChat: (message: string) => Promise<Record<string, unknown>>;
      openChatWindow: () => Promise<Record<string, unknown>>;
      closeChatWindow: () => Promise<boolean>;
      requestTranscript: (prompt?: string) => Promise<Record<string, unknown>>;
      loadHistorySession: (sessionId: string) => Promise<Record<string, unknown>>;
      leaveHistorySession: () => Promise<Record<string, unknown>>;
      onState: (listener: (payload: Record<string, unknown>) => void) => () => void;
      onChatState: (listener: (payload: Record<string, unknown>) => void) => () => void;
    };
  }
}

export {};
