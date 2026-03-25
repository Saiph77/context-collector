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
    };
  }
}

export {};
