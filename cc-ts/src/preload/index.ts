import { contextBridge, ipcRenderer } from 'electron';

export interface PanelState {
  title: string;
  content: string;
}

export type PreviewKind = 'markdown' | 'text' | 'unsupported';

export interface ExplorerNode {
  name: string;
  path: string;
  kind: 'directory' | 'file';
  previewKind?: PreviewKind;
  children?: ExplorerNode[];
}

export interface ExplorerPayload {
  baseDir: string;
  defaultProjectName: string;
  nodes: ExplorerNode[];
}

interface PresentPayload {
  text: string;
}

interface SavedPayload {
  path: string;
}

export interface FilePreviewPayload {
  path: string;
  previewKind: PreviewKind;
  content: string;
}

export interface AgentMessageInput {
  message: string;
  contextFiles: Array<{
    path: string;
    content: string;
    previewKind: PreviewKind;
  }>;
}

export interface AgentMessageOutput {
  role: 'agent';
  content: string;
  timestamp: string;
}

export interface AgentStreamChunk {
  type: 'chunk' | 'done' | 'error';
  content?: string;
  message?: string;
  timestamp?: string;
}

const api = {
  sendStateUpdate(state: PanelState): void {
    ipcRenderer.send('panel:state-update', state);
  },
  requestSave(): void {
    ipcRenderer.send('panel:request-save');
  },
  requestClose(): void {
    ipcRenderer.send('panel:request-close');
  },
  listFiles(): Promise<ExplorerPayload> {
    return ipcRenderer.invoke('panel:list-files');
  },
  updateStorageBaseDir(baseDir: string): Promise<ExplorerPayload> {
    return ipcRenderer.invoke('panel:update-storage-base-dir', { baseDir });
  },
  readFile(path: string): Promise<FilePreviewPayload> {
    return ipcRenderer.invoke('panel:read-file', { path });
  },
  sendAgentMessage(input: AgentMessageInput): Promise<AgentMessageOutput> {
    return ipcRenderer.invoke('panel:send-agent-message', input);
  },
  sendAgentMessageStream(
    input: AgentMessageInput,
  ): Promise<void> {
    return ipcRenderer.invoke('panel:send-agent-message-stream', input);
  },
  onAgentStreamChunk(listener: (chunk: AgentStreamChunk) => void): () => void {
    const wrapped = (_event: Electron.IpcRendererEvent, chunk: AgentStreamChunk) => listener(chunk);
    ipcRenderer.on('agent:stream-chunk', wrapped);
    return () => ipcRenderer.removeListener('agent:stream-chunk', wrapped);
  },
  onPresent(listener: (payload: PresentPayload) => void): () => void {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: PresentPayload) => listener(payload);
    ipcRenderer.on('panel:present', wrapped);
    return () => ipcRenderer.removeListener('panel:present', wrapped);
  },
  onFocusTitle(listener: () => void): () => void {
    const wrapped = () => listener();
    ipcRenderer.on('panel:focus-title', wrapped);
    return () => ipcRenderer.removeListener('panel:focus-title', wrapped);
  },
  onSaved(listener: (payload: SavedPayload) => void): () => void {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: SavedPayload) => listener(payload);
    ipcRenderer.on('panel:saved', wrapped);
    return () => ipcRenderer.removeListener('panel:saved', wrapped);
  },
};

contextBridge.exposeInMainWorld('ccApi', api);
