import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { app, clipboard, dialog, nativeImage, screen, type IpcMain } from 'electron';

import { ChatDialogWindow } from './chat-dialog-window';
import type { NativeBridge } from './native-bridge';
import {
  ScreenshotPersistence,
  type VisionHistorySnapshot,
  type VisionHistorySummary,
} from './screenshot-persistence';
import { ScreenshotBarWindow } from './screenshot-bar-window';
import {
  VisionApiClient,
  type VisionAttachment,
  type VisionStreamEvent,
} from './vision-api';

const execFileAsync = promisify(execFile);

const MAX_ATTACHMENTS = 9;
const MAX_IMAGE_EDGE = 1024;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const IMAGE_JPEG_QUALITY = 85;

const ALLOWED_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.bmp',
  '.heic',
  '.tiff',
  '.pdf',
  '.md',
  '.txt',
  '.json',
]);

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.heic': 'image/heic',
  '.tiff': 'image/tiff',
  '.pdf': 'application/pdf',
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.json': 'application/json',
};

interface TranscriptState {
  running: boolean;
  phase: 'idle' | 'uploading' | 'parsing' | 'streaming' | 'done' | 'error';
  progress: number;
  message: string;
  sessionPath?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  streaming?: boolean;
}

interface RemoveAttachmentPayload {
  index: number;
}

interface PromptPayload {
  prompt?: string;
}

interface ChatPayload {
  message: string;
}

interface LoadHistoryPayload {
  sessionId: string;
}

export class ScreenshotController {
  private readonly visionApi: VisionApiClient;
  private readonly barWindow: ScreenshotBarWindow;
  private readonly chatWindow: ChatDialogWindow;

  private persistence: ScreenshotPersistence | null = null;
  private attachments: VisionAttachment[] = [];
  private chatMessages: ChatMessage[] = [];
  private transcriptState: TranscriptState = {
    running: false,
    phase: 'idle',
    progress: 0,
    message: '',
  };

  private historySummaries: VisionHistorySummary[] = [];
  private currentSessionId: string | null = null;
  private browsingHistorySessionId: string | null = null;

  private captureInFlight = false;
  private chatInFlight = false;
  private transcriptInFlight = false;
  private anchorSyncTimer: NodeJS.Timeout | null = null;
  private lastAnchorBounds: Electron.Rectangle | null = null;

  constructor(nativeBridge: NativeBridge, serverUrl: string) {
    this.visionApi = new VisionApiClient(serverUrl);
    this.barWindow = new ScreenshotBarWindow(nativeBridge);
    this.chatWindow = new ChatDialogWindow();
  }

  setupIpc(ipcMain: IpcMain): void {
    ipcMain.handle('vision:get-state', async () => this.buildBarState());
    ipcMain.handle('vision:get-chat-state', async () => this.buildChatState());

    ipcMain.handle('vision:start-new-session', async () => {
      await this.ensureBarVisible();
      this.startNewSession('manual');
      return this.buildBarState();
    });

    ipcMain.handle('vision:request-screenshot', async () => {
      await this.captureScreenshotAndAttach();
      return this.buildBarState();
    });

    ipcMain.handle('vision:request-upload-files', async () => {
      await this.uploadFiles();
      return this.buildBarState();
    });

    ipcMain.handle('vision:paste-clipboard-image', async () => {
      return this.pasteClipboardImage();
    });

    ipcMain.handle('vision:remove-attachment', async (_event, payload: RemoveAttachmentPayload) => {
      this.removeAttachment(payload.index);
      return this.buildBarState();
    });

    ipcMain.handle('vision:send-chat', async (_event, payload: ChatPayload) => {
      await this.sendChat(payload.message);
      return this.buildChatState();
    });

    ipcMain.handle('vision:open-chat-window', async () => {
      await this.openChatWindow();
      return this.buildChatState();
    });

    ipcMain.handle('vision:close-chat-window', async () => {
      this.chatWindow.hide();
      return true;
    });

    ipcMain.handle('vision:request-transcript', async (_event, payload: PromptPayload) => {
      await this.requestTranscript(payload.prompt || '');
      return this.buildBarState();
    });

    ipcMain.handle('vision:load-history-session', async (_event, payload: LoadHistoryPayload) => {
      await this.loadHistorySession(payload.sessionId);
      return this.buildBarState();
    });

    ipcMain.handle('vision:leave-history-session', async () => {
      this.leaveHistoryMode();
      return this.buildBarState();
    });
  }

  isBarVisible(): boolean {
    return this.barWindow.isVisible();
  }

  async handleOptionDoubleTap(): Promise<void> {
    await this.ensureBarVisible();
    await this.captureScreenshotAndAttach();
  }

  async startNewSessionFromHotkey(): Promise<void> {
    await this.ensureBarVisible();
    this.startNewSession('manual');
  }

  async requestTranscriptFromHotkey(): Promise<void> {
    await this.ensureBarVisible();
    await this.requestTranscript('');
  }

  hideAllWindows(): void {
    this.chatWindow.hide();
    this.barWindow.hide();
    this.stopAnchorSync();
  }

  dispose(): void {
    this.stopAnchorSync();
    this.barWindow.setAllowClose(true);
    this.chatWindow.setAllowClose(true);
    this.chatWindow.hide();
    this.barWindow.hide();
  }

  private async ensureBarVisible(): Promise<void> {
    await this.barWindow.show();
    this.startAnchorSync();
    this.getPersistence();
    this.refreshHistorySummaries();
    this.sendBarState();
  }

  private async openChatWindow(): Promise<void> {
    await this.ensureBarVisible();
    const anchorBounds = this.barWindow.getBounds();
    if (!anchorBounds) {
      return;
    }

    await this.chatWindow.showAbove(anchorBounds);
    this.sendChatState();
  }

  private async captureScreenshotAndAttach(): Promise<void> {
    if (this.captureInFlight) {
      return;
    }

    this.ensureWritableSession();

    if (this.attachments.length >= MAX_ATTACHMENTS) {
      this.setTranscriptInfo('error', 1, `最多支持 ${MAX_ATTACHMENTS} 个附件。`);
      return;
    }

    this.captureInFlight = true;
    const barWasVisible = this.barWindow.isVisible();
    const chatWasVisible = this.chatWindow.isVisible();

    const screenshotPath = path.join(
      app.getPath('temp'),
      `cc-shot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`,
    );

    try {
      this.barWindow.hide();
      this.chatWindow.hide();

      await execFileAsync('screencapture', ['-i', '-x', screenshotPath]);

      if (!fs.existsSync(screenshotPath)) {
        return;
      }

      const stat = fs.statSync(screenshotPath);
      if (stat.size <= 0) {
        return;
      }

      this.addAttachmentFromImagePath(screenshotPath, path.basename(screenshotPath), 'screenshot');
      this.syncAttachmentsToPersistence();
    } catch (error) {
      const maybeCode = (error as { code?: number | string }).code;
      if (maybeCode !== 1 && maybeCode !== '1') {
        this.setTranscriptInfo('error', 1, error instanceof Error ? error.message : '截图失败');
      }
    } finally {
      if (fs.existsSync(screenshotPath)) {
        try {
          fs.unlinkSync(screenshotPath);
        } catch {
          // ignore cleanup errors
        }
      }

      if (barWasVisible) {
        await this.barWindow.show();
      }
      if (chatWasVisible) {
        await this.openChatWindow();
      }

      this.captureInFlight = false;
      this.sendBarState();
    }
  }

  private async uploadFiles(): Promise<void> {
    await this.ensureBarVisible();
    this.ensureWritableSession();

    const result = await dialog.showOpenDialog({
      title: '选择图片或文件',
      buttonLabel: '添加到会话',
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Supported Files',
          extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'heic', 'tiff', 'pdf', 'md', 'txt', 'json'],
        },
      ],
    });

    if (result.canceled) {
      return;
    }

    for (const filePath of result.filePaths) {
      if (this.attachments.length >= MAX_ATTACHMENTS) {
        this.setTranscriptInfo('error', 1, `最多支持 ${MAX_ATTACHMENTS} 个附件。`);
        break;
      }

      try {
        this.addAttachmentFromPath(filePath, 'upload');
      } catch (error) {
        this.setTranscriptInfo('error', 1, error instanceof Error ? error.message : `无法添加文件: ${filePath}`);
      }
    }

    this.syncAttachmentsToPersistence();
    this.sendBarState();
  }

  private pasteClipboardImage(): boolean {
    this.ensureWritableSession();

    if (this.attachments.length >= MAX_ATTACHMENTS) {
      this.setTranscriptInfo('error', 1, `最多支持 ${MAX_ATTACHMENTS} 个附件。`);
      return false;
    }

    const image = clipboard.readImage();
    if (image.isEmpty()) {
      return false;
    }

    this.addAttachmentFromNativeImage(image, `clipboard-${Date.now()}.png`, 'upload');
    this.syncAttachmentsToPersistence();
    this.sendBarState();
    this.sendChatState();
    return true;
  }

  private addAttachmentFromPath(filePath: string, source: 'screenshot' | 'upload'): void {
    const ext = path.extname(filePath).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new Error(`不支持的文件类型: ${ext || '(none)'}`);
    }

    if (
      ext.startsWith('.jp') ||
      ext === '.png' ||
      ext === '.webp' ||
      ext === '.gif' ||
      ext === '.bmp' ||
      ext === '.heic' ||
      ext === '.tiff'
    ) {
      this.addAttachmentFromImagePath(filePath, path.basename(filePath), source);
      return;
    }

    const stat = fs.statSync(filePath);
    if (stat.size > MAX_UPLOAD_BYTES) {
      throw new Error(`文件过大（>${MAX_UPLOAD_BYTES / (1024 * 1024)}MB）: ${path.basename(filePath)}`);
    }

    const mimeType = MIME_MAP[ext] || 'application/octet-stream';
    const buffer = fs.readFileSync(filePath);

    this.attachments.push({
      id: this.nextId('file'),
      name: path.basename(filePath),
      kind: 'file',
      source,
      mimeType,
      base64: buffer.toString('base64'),
    });
  }

  private addAttachmentFromImagePath(
    filePath: string,
    fileName: string,
    source: 'screenshot' | 'upload',
  ): void {
    const image = nativeImage.createFromPath(filePath);
    if (image.isEmpty()) {
      throw new Error(`无法读取图片: ${fileName}`);
    }
    this.addAttachmentFromNativeImage(image, fileName, source);
  }

  private addAttachmentFromNativeImage(
    imageInput: Electron.NativeImage,
    fileName: string,
    source: 'screenshot' | 'upload',
  ): void {
    let image = imageInput;

    const size = image.getSize();
    const maxEdge = Math.max(size.width, size.height);

    if (maxEdge > MAX_IMAGE_EDGE) {
      const scale = MAX_IMAGE_EDGE / maxEdge;
      image = image.resize({
        width: Math.max(1, Math.round(size.width * scale)),
        height: Math.max(1, Math.round(size.height * scale)),
      });
    }

    const resized = image.getSize();
    const jpegBuffer = image.toJPEG(IMAGE_JPEG_QUALITY);

    this.attachments.push({
      id: this.nextId('image'),
      name: fileName,
      kind: 'image',
      source,
      mimeType: 'image/jpeg',
      base64: jpegBuffer.toString('base64'),
      width: resized.width,
      height: resized.height,
    });
  }

  private removeAttachment(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.attachments.length) {
      return;
    }

    this.attachments.splice(index, 1);
    this.syncAttachmentsToPersistence();
    this.sendBarState();
    this.sendChatState();
  }

  private async sendChat(message: string): Promise<void> {
    const prompt = message.trim();
    if (!prompt) {
      return;
    }

    if (this.chatInFlight) {
      return;
    }

    this.ensureWritableSession();
    await this.openChatWindow();
    this.chatMessages = [];
    this.sendChatState();

    const userMessage: ChatMessage = {
      id: this.nextId('chat-user'),
      role: 'user',
      content: prompt,
      timestamp: new Date().toISOString(),
    };

    const assistantMessage: ChatMessage = {
      id: this.nextId('chat-assistant'),
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      streaming: true,
    };

    this.chatMessages.push(userMessage, assistantMessage);
    this.chatInFlight = true;
    this.sendChatState();

    const persistence = this.getPersistence();
    this.syncAttachmentsToPersistence();
    const interactionId = persistence.startInteraction('chat', prompt);
    this.refreshHistorySummaries();

    let fullResponse = '';

    try {
      await this.visionApi.streamVisionChat(
        {
          message: prompt,
          attachments: this.attachments,
          history: [],
        },
        (event) => {
          this.applyChatStreamEvent(assistantMessage.id, event, (content) => {
            fullResponse = content;
          });
        },
      );

      this.finalizeAssistantMessage(assistantMessage.id);
      persistence.finishInteractionSuccess(interactionId, fullResponse);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Chat failed';
      this.patchAssistantMessage(assistantMessage.id, `Error: ${messageText}`, false);
      this.finalizeAssistantMessage(assistantMessage.id);
      persistence.finishInteractionError(interactionId, messageText);
    } finally {
      this.chatInFlight = false;
      this.refreshHistorySummaries();
      this.sendChatState();
      this.sendBarState();
    }
  }

  private async requestTranscript(prompt: string): Promise<void> {
    if (this.transcriptInFlight) {
      return;
    }

    this.ensureWritableSession();

    if (this.attachments.length === 0) {
      this.setTranscriptInfo('error', 1, '请先添加至少一张图片或文件。');
      return;
    }

    const trimmedPrompt = prompt.trim();
    this.transcriptInFlight = true;

    const persistence = this.getPersistence();
    this.syncAttachmentsToPersistence();
    const interactionId = persistence.startInteraction('transcript', trimmedPrompt);
    this.refreshHistorySummaries();

    this.setTranscriptInfo('uploading', 0.2, '上传中...');

    let output = '';

    try {
      await this.visionApi.streamTranscript(
        {
          prompt: trimmedPrompt || undefined,
          attachments: this.attachments,
        },
        (event) => {
          this.applyTranscriptStreamEvent(event, (chunk) => {
            output += chunk;
          });
        },
      );

      const normalized = output.trim();
      clipboard.writeText(normalized);
      this.transcriptState = {
        running: false,
        phase: 'idle',
        progress: 0,
        message: '',
        sessionPath: persistence.getSessionPath(),
      };
      persistence.finishInteractionSuccess(interactionId, normalized);
      this.refreshHistorySummaries();
      this.sendBarState();
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Transcript failed';
      this.transcriptState = {
        running: false,
        phase: 'error',
        progress: 1,
        message: `转换失败: ${messageText}`,
        sessionPath: persistence.getSessionPath(),
      };
      persistence.finishInteractionError(interactionId, messageText);
      this.refreshHistorySummaries();
      this.sendBarState();
      setTimeout(() => {
        if (this.transcriptInFlight) {
          return;
        }
        if (this.transcriptState.phase !== 'error') {
          return;
        }
        this.transcriptState = {
          running: false,
          phase: 'idle',
          progress: 0,
          message: '',
          sessionPath: persistence.getSessionPath(),
        };
        this.sendBarState();
      }, 2600);
    } finally {
      this.transcriptInFlight = false;
    }
  }

  private applyChatStreamEvent(
    assistantId: string,
    event: VisionStreamEvent,
    onContentUpdate: (content: string) => void,
  ): void {
    if (event.type === 'chunk') {
      const next = this.patchAssistantMessage(assistantId, event.content, true);
      onContentUpdate(next);
      return;
    }

    if (event.type === 'error') {
      throw new Error(event.message);
    }

    if (event.type === 'done') {
      this.finalizeAssistantMessage(assistantId);
      return;
    }
  }

  private applyTranscriptStreamEvent(event: VisionStreamEvent, onChunk: (chunk: string) => void): void {
    if (event.type === 'phase') {
      if (event.phase === 'uploading') {
        this.setTranscriptInfo('uploading', 0.2, '上传中...');
      } else if (event.phase === 'parsing') {
        this.setTranscriptInfo('parsing', 0.55, '解析中...');
      } else if (event.phase === 'streaming') {
        this.setTranscriptInfo('streaming', 0.8, '流式输出中...');
      }
      return;
    }

    if (event.type === 'chunk') {
      if (this.transcriptState.phase === 'idle') {
        this.setTranscriptInfo('streaming', 0.8, '流式输出中...');
      }
      onChunk(event.content);
      return;
    }

    if (event.type === 'error') {
      throw new Error(event.message);
    }

    if (event.type === 'done') {
      this.setTranscriptInfo('streaming', 0.95, '正在收尾...');
    }
  }

  private setTranscriptInfo(
    phase: TranscriptState['phase'],
    progress: number,
    message: string,
  ): void {
    const persistencePath = this.persistence?.getSessionPath();
    this.transcriptState = {
      running: phase === 'uploading' || phase === 'parsing' || phase === 'streaming',
      phase,
      progress,
      message,
      sessionPath: persistencePath,
    };
    this.sendBarState();
  }

  private patchAssistantMessage(messageId: string, content: string, append: boolean): string {
    let resolved = content;

    this.chatMessages = this.chatMessages.map((item) => {
      if (item.id !== messageId) {
        return item;
      }

      resolved = append ? `${item.content}${content}` : content;
      return {
        ...item,
        content: resolved,
      };
    });

    this.sendChatState();
    return resolved;
  }

  private finalizeAssistantMessage(messageId: string): void {
    this.chatMessages = this.chatMessages.map((item) => {
      if (item.id !== messageId) {
        return item;
      }

      return {
        ...item,
        streaming: false,
        timestamp: new Date().toISOString(),
      };
    });
    this.sendChatState();
  }

  private buildBarState(): Record<string, unknown> {
    return {
      maxAttachments: MAX_ATTACHMENTS,
      attachments: this.attachments.map((item) => ({
        id: item.id,
        name: item.name,
        kind: item.kind,
        source: item.source,
        mimeType: item.mimeType,
        width: item.width,
        height: item.height,
        previewDataUrl: item.kind === 'image' ? `data:${item.mimeType};base64,${item.base64}` : null,
      })),
      transcript: this.transcriptState,
      historySessions: this.historySummaries,
      currentSessionId: this.currentSessionId,
      readonlyHistorySessionId: this.browsingHistorySessionId,
    };
  }

  private buildChatState(): Record<string, unknown> {
    return {
      messages: this.chatMessages,
      attachmentCount: this.attachments.length,
      sending: this.chatInFlight,
      currentSessionId: this.currentSessionId,
      readonlyHistorySessionId: this.browsingHistorySessionId,
    };
  }

  private sendBarState(): void {
    this.barWindow.send('vision:state', this.buildBarState());
  }

  private sendChatState(): void {
    this.chatWindow.send('vision:chat-state', this.buildChatState());
  }

  private syncAttachmentsToPersistence(): void {
    const persistence = this.getPersistence();
    persistence.upsertAttachments(this.attachments);
    this.currentSessionId = persistence.getCurrentSessionId();
    this.refreshHistorySummaries();
  }

  private getPersistence(): ScreenshotPersistence {
    if (this.persistence) {
      return this.persistence;
    }

    const rootDir = path.join(app.getPath('userData'), 'vision-sessions');
    this.persistence = new ScreenshotPersistence(rootDir);
    this.historySummaries = this.persistence.listHistorySummaries();
    return this.persistence;
  }

  private refreshHistorySummaries(): void {
    if (!this.persistence) {
      return;
    }
    this.historySummaries = this.persistence.listHistorySummaries();
  }

  private startNewSession(_reason: 'double-option' | 'manual' | 'first-write'): void {
    const persistence = this.getPersistence();
    const session = persistence.startNewSession();

    this.currentSessionId = session.id;
    this.browsingHistorySessionId = null;
    this.attachments = [];
    this.chatMessages = [];
    this.transcriptState = {
      running: false,
      phase: 'idle',
      progress: 0,
      message: '',
      sessionPath: persistence.getSessionPath(),
    };

    this.refreshHistorySummaries();
    this.sendBarState();
    this.sendChatState();
  }

  private ensureWritableSession(): void {
    const persistence = this.getPersistence();

    if (this.browsingHistorySessionId) {
      this.startNewSession('first-write');
      return;
    }

    if (!persistence.hasSession()) {
      this.startNewSession('first-write');
    }
  }

  private async loadHistorySession(sessionId: string): Promise<void> {
    const target = sessionId.trim();
    if (!target) {
      return;
    }

    const persistence = this.getPersistence();
    const snapshot = persistence.loadHistorySession(target);
    if (!snapshot) {
      this.setTranscriptInfo('error', 1, '未找到历史会话。');
      return;
    }

    this.applyHistorySnapshot(snapshot);
    await this.openChatWindow();
    this.sendBarState();
    this.sendChatState();
  }

  private applyHistorySnapshot(snapshot: VisionHistorySnapshot): void {
    this.browsingHistorySessionId = snapshot.id;
    this.currentSessionId = snapshot.id;
    this.attachments = [];
    this.transcriptState = {
      running: false,
      phase: 'idle',
      progress: 0,
      message: `已加载历史会话：${formatIso(snapshot.updatedAt)}`,
    };

    const messages: ChatMessage[] = [];
    for (const interaction of snapshot.interactions) {
      if (interaction.prompt.trim().length > 0) {
        messages.push({
          id: `${interaction.id}-user`,
          role: 'user',
          content: interaction.prompt,
          timestamp: interaction.startedAt,
        });
      }

      const assistantText =
        interaction.status === 'error'
          ? `Error: ${interaction.error || 'unknown error'}`
          : interaction.response || '';

      if (assistantText.trim().length > 0) {
        messages.push({
          id: `${interaction.id}-assistant`,
          role: 'assistant',
          content: assistantText,
          timestamp: interaction.finishedAt || interaction.startedAt,
        });
      }
    }

    this.chatMessages = messages;
  }

  private leaveHistoryMode(): void {
    this.browsingHistorySessionId = null;

    const persistence = this.getPersistence();
    this.currentSessionId = persistence.getCurrentSessionId();

    this.chatMessages = [];
    this.transcriptState = {
      ...this.transcriptState,
      phase: 'idle',
      running: false,
      progress: 0,
      message: '',
    };

    this.sendBarState();
    this.sendChatState();
  }

  private startAnchorSync(): void {
    if (this.anchorSyncTimer) {
      return;
    }

    this.anchorSyncTimer = setInterval(() => {
      const bounds = this.barWindow.getBounds();
      if (!bounds) {
        return;
      }

      const barMoved = !rectEquals(bounds, this.lastAnchorBounds);
      this.lastAnchorBounds = bounds;

      if (this.chatWindow.isVisible()) {
        const chatBounds = this.chatWindow.getBounds();
        const isSameDisplay =
          chatBounds !== null && this.resolveDisplayId(bounds) === this.resolveDisplayId(chatBounds);

        if (barMoved || !isSameDisplay) {
          this.chatWindow.repositionAbove(bounds);
        }
      }
    }, 250);
  }

  private stopAnchorSync(): void {
    if (!this.anchorSyncTimer) {
      return;
    }

    clearInterval(this.anchorSyncTimer);
    this.anchorSyncTimer = null;
    this.lastAnchorBounds = null;
  }

  private resolveDisplayId(bounds: Electron.Rectangle): number {
    return screen.getDisplayNearestPoint({
      x: bounds.x + Math.round(bounds.width / 2),
      y: bounds.y + Math.round(bounds.height / 2),
    }).id;
  }

  private nextId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

function formatIso(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return date.toLocaleString('zh-CN', {
    hour12: false,
  });
}

function rectEquals(left: Electron.Rectangle, right: Electron.Rectangle | null): boolean {
  if (!right) {
    return false;
  }

  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}
