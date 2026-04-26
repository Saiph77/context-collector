import { contextBridge, ipcRenderer } from 'electron';

const visionApi = {
  getState(): Promise<Record<string, unknown>> {
    return ipcRenderer.invoke('vision:get-state');
  },

  getChatState(): Promise<Record<string, unknown>> {
    return ipcRenderer.invoke('vision:get-chat-state');
  },

  requestScreenshot(): Promise<Record<string, unknown>> {
    return ipcRenderer.invoke('vision:request-screenshot');
  },

  startNewSession(): Promise<Record<string, unknown>> {
    return ipcRenderer.invoke('vision:start-new-session');
  },

  requestUploadFiles(): Promise<Record<string, unknown>> {
    return ipcRenderer.invoke('vision:request-upload-files');
  },

  pasteClipboardImage(): Promise<boolean> {
    return ipcRenderer.invoke('vision:paste-clipboard-image');
  },

  removeAttachment(index: number): Promise<Record<string, unknown>> {
    return ipcRenderer.invoke('vision:remove-attachment', { index });
  },

  sendChat(message: string): Promise<Record<string, unknown>> {
    return ipcRenderer.invoke('vision:send-chat', { message });
  },

  openChatWindow(): Promise<Record<string, unknown>> {
    return ipcRenderer.invoke('vision:open-chat-window');
  },

  closeChatWindow(): Promise<boolean> {
    return ipcRenderer.invoke('vision:close-chat-window');
  },

  requestTranscript(prompt?: string): Promise<Record<string, unknown>> {
    return ipcRenderer.invoke('vision:request-transcript', { prompt });
  },

  loadHistorySession(sessionId: string): Promise<Record<string, unknown>> {
    return ipcRenderer.invoke('vision:load-history-session', { sessionId });
  },

  leaveHistorySession(): Promise<Record<string, unknown>> {
    return ipcRenderer.invoke('vision:leave-history-session');
  },

  onState(listener: (payload: Record<string, unknown>) => void): () => void {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: Record<string, unknown>) => listener(payload);
    ipcRenderer.on('vision:state', wrapped);
    return () => ipcRenderer.removeListener('vision:state', wrapped);
  },

  onChatState(listener: (payload: Record<string, unknown>) => void): () => void {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: Record<string, unknown>) => listener(payload);
    ipcRenderer.on('vision:chat-state', wrapped);
    return () => ipcRenderer.removeListener('vision:chat-state', wrapped);
  },
};

contextBridge.exposeInMainWorld('visionApi', visionApi);
