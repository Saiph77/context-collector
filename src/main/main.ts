import path from 'node:path';
import process from 'node:process';
import fs from 'node:fs';
import { app, clipboard, ipcMain } from 'electron';

import {
  HotkeyController,
  DOUBLE_CMD_C_THRESHOLD_MS,
  OPEN_DEBOUNCE_MS,
} from './hotkey-controller';
import { GlobalHotkeyManager } from './global-hotkey-manager';
import { NativeBridge } from './native-bridge';
import { ScreenshotController } from './screenshot-controller';
import { DEFAULT_PROJECT_NAME, sanitizeTitle, saveMarkdownClip } from './storage';
import { WindowController } from './window-controller';

interface PanelState {
  title: string;
  content: string;
}

type PreviewKind = 'markdown' | 'text' | 'unsupported';

interface ExplorerNode {
  name: string;
  path: string;
  kind: 'directory' | 'file';
  previewKind?: PreviewKind;
  children?: ExplorerNode[];
}

interface ExplorerPayload {
  baseDir: string;
  defaultProjectName: string;
  nodes: ExplorerNode[];
}

interface ReadFilePayload {
  path: string;
}

interface FilePreviewPayload {
  path: string;
  previewKind: PreviewKind;
  content: string;
}

interface AgentContextFile {
  path: string;
  content: string;
  previewKind: PreviewKind;
}

interface AgentMessageInput {
  message: string;
  contextFiles: AgentContextFile[];
}

interface AgentMessageOutput {
  role: 'agent';
  content: string;
  timestamp: string;
}

interface AgentStreamChunk {
  type: 'chunk' | 'done' | 'error';
  content?: string;
  message?: string;
  timestamp?: string;
}

interface SaveTitleResolution {
  title: string;
  generated: boolean;
}

interface PanelConfig {
  storageBaseDir?: string;
}

interface UpdateStorageBaseDirPayload {
  baseDir: string;
}

const panelState: PanelState = {
  title: 'untitled',
  content: '',
};

const AGENT_SERVER_URL = process.env.AGENT_SERVER_URL || 'http://127.0.0.1:5678';

let storageBaseDir = '';
let saveQueue: Promise<void> = Promise.resolve();
const nativeBridge = new NativeBridge();
const hotkeyController = new HotkeyController({
  doubleCmdCThresholdMs: DOUBLE_CMD_C_THRESHOLD_MS,
  openDebounceMs: OPEN_DEBOUNCE_MS,
});
const windowController = new WindowController(nativeBridge);
const screenshotController = new ScreenshotController(nativeBridge, AGENT_SERVER_URL);
const globalHotkeyManager = new GlobalHotkeyManager(nativeBridge, hotkeyController, {
  isPanelVisible: () => windowController.isVisible(),
  isVisionBarVisible: () => screenshotController.isBarVisible(),
  onOpenPanel: () => {
    void openPanelFromClipboard();
  },
  onOpenVisionBar: () => {
    void screenshotController.handleOptionDoubleTap();
  },
  onVisionTranscript: () => {
    void screenshotController.requestTranscriptFromHotkey();
  },
  onVisionNewSession: () => {
    void screenshotController.startNewSessionFromHotkey();
  },
  onCloseVision: () => {
    screenshotController.hideAllWindows();
  },
  onSavePanel: () => {
    if (windowController.isVisible()) {
      saveAndHidePanel();
    }
  },
  onClosePanel: () => {
    if (windowController.isVisible()) {
      windowController.hidePanel();
    }
    screenshotController.hideAllWindows();
  },
  onToggleLeftSidebar: () => {
    if (windowController.isVisible()) {
      windowController.toggleLeftSidebar();
    }
  },
  onToggleRightSidebar: () => {
    if (windowController.isVisible()) {
      windowController.toggleRightSidebar();
    }
  },
});

let shuttingDown = false;

function setupIpc(): void {
  screenshotController.setupIpc(ipcMain);

  ipcMain.on('panel:state-update', (_event, state: PanelState) => {
    panelState.title = state.title;
    panelState.content = state.content;
  });

  ipcMain.on('panel:request-save', () => {
    saveAndHidePanel();
  });

  ipcMain.on('panel:request-close', () => {
    windowController.hidePanel();
  });

  ipcMain.handle('panel:list-files', async (): Promise<ExplorerPayload> => {
    const baseDir = resolveStorageBaseDir();
    return {
      baseDir,
      defaultProjectName: DEFAULT_PROJECT_NAME,
      nodes: buildExplorerNodes(baseDir),
    };
  });

  ipcMain.handle('panel:read-file', async (_event, payload: ReadFilePayload): Promise<FilePreviewPayload> => {
    const absolutePath = assertPathInsideStorage(payload.path);
    const stat = fs.statSync(absolutePath);
    if (!stat.isFile()) {
      throw new Error(`Not a file: ${absolutePath}`);
    }

    const previewKind = detectPreviewKind(absolutePath);
    if (previewKind === 'unsupported') {
      return {
        path: absolutePath,
        previewKind,
        content: '',
      };
    }

    return {
      path: absolutePath,
      previewKind,
      content: fs.readFileSync(absolutePath, { encoding: 'utf8' }),
    };
  });

  ipcMain.handle(
    'panel:send-agent-message',
    async (_event, input: AgentMessageInput): Promise<AgentMessageOutput> => {
      return buildStubAgentReply(buildAgentInputWithStorageContext(input));
    },
  );

  ipcMain.handle(
    'panel:send-agent-message-stream',
    async (event, input: AgentMessageInput): Promise<void> => {
      try {
        const mergedInput = buildAgentInputWithStorageContext(input);
        let emittedTerminal = false;

        await streamAgentResponse(mergedInput, (chunk) => {
          if (chunk.type === 'done' || chunk.type === 'error') {
            emittedTerminal = true;
          }
          event.sender.send('agent:stream-chunk', chunk);
        });

        if (!emittedTerminal) {
          event.sender.send('agent:stream-chunk', {
            type: 'done',
            timestamp: new Date().toISOString(),
          } satisfies AgentStreamChunk);
        }
      } catch (error) {
        const errorChunk = {
          type: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        } satisfies AgentStreamChunk;
        event.sender.send('agent:stream-chunk', errorChunk);
      }
    },
  );

  ipcMain.handle(
    'panel:update-storage-base-dir',
    async (_event, payload: UpdateStorageBaseDirPayload): Promise<ExplorerPayload> => {
      const nextBaseDir = normalizeStorageBaseDir(payload.baseDir);
      fs.mkdirSync(nextBaseDir, { recursive: true });
      storageBaseDir = nextBaseDir;
      savePanelConfig({ storageBaseDir: nextBaseDir });

      return {
        baseDir: storageBaseDir,
        defaultProjectName: DEFAULT_PROJECT_NAME,
        nodes: buildExplorerNodes(storageBaseDir),
      };
    },
  );
}

function saveAndHidePanel(): void {
  const snapshot: PanelState = {
    title: panelState.title,
    content: panelState.content,
  };

  windowController.hidePanel();
  enqueueBackgroundSave(snapshot);
}

function enqueueBackgroundSave(snapshot: PanelState): void {
  saveQueue = saveQueue.then(async () => {
    try {
      const resolvedTitle = await resolveTitleForSave(snapshot.title, snapshot.content);
      const title = resolvedTitle.title;
      const contentToSave = resolvedTitle.generated
        ? prependTitleHeading(title, snapshot.content)
        : snapshot.content;

      const outputPath = saveMarkdownClip({
        baseDir: resolveStorageBaseDir(),
        projectName: DEFAULT_PROJECT_NAME,
        title,
        content: contentToSave,
      });

      windowController.onSaveResult(outputPath);
    } catch (error) {
      console.error('Failed to save panel content in background:', error);
    }
  });
}

async function resolveTitleForSave(rawTitle: string, content: string): Promise<SaveTitleResolution> {
  const manualTitle = sanitizeTitle(rawTitle);
  if (!shouldAutoGenerateTitle(rawTitle, manualTitle)) {
    return {
      title: manualTitle,
      generated: false,
    };
  }

  const autoTitle = await generateTitleWithAgent(content);
  if (autoTitle) {
    return {
      title: autoTitle,
      generated: true,
    };
  }

  return {
    title: 'untitled',
    generated: true,
  };
}

function shouldAutoGenerateTitle(rawTitle: string, sanitizedTitle: string): boolean {
  if (!sanitizedTitle) {
    return true;
  }

  const rawLower = rawTitle.trim().toLowerCase();
  const sanitizedLower = sanitizedTitle.toLowerCase();
  return rawLower === 'untitled' || sanitizedLower === 'untitled';
}

function prependTitleHeading(title: string, content: string): string {
  const heading = `# ${title}`;
  if (content.trim().length === 0) {
    return `${heading}\n`;
  }
  if (content.trimStart().startsWith(heading)) {
    return content;
  }
  return `${heading}\n\n${content}`;
}

async function generateTitleWithAgent(content: string): Promise<string | null> {
  const trimmedContent = content.trim();
  if (!trimmedContent) {
    return null;
  }

  const prompt = [
    'Generate a concise title for the clipboard content below.',
    'Return title only, no quotes, no markdown, no extra explanation.',
    'Prefer 8-20 characters, keep it filesystem-friendly.',
    '',
    'Clipboard content:',
    trimmedContent,
  ].join('\n');

  const requestInput = buildAgentInputWithStorageContext({
    message: prompt,
    contextFiles: [
      {
        path: 'clipboard://current-content',
        content: trimmedContent,
        previewKind: 'text',
      },
    ],
  });

  try {
    const responseText = await collectAgentResponseText(requestInput);
    const firstLine = responseText.split('\n').map((line) => line.trim()).find((line) => line.length > 0) ?? '';
    const title = sanitizeTitle(firstLine);
    return title || null;
  } catch (error) {
    console.error('Failed to generate title via agent:', error);
    return null;
  }
}

function buildAgentInputWithStorageContext(input: AgentMessageInput): AgentMessageInput {
  const directoryFiles = collectStorageContextFiles(resolveStorageBaseDir());
  const merged = new Map<string, AgentContextFile>();

  for (const item of input.contextFiles) {
    merged.set(path.resolve(item.path), item);
  }

  for (const item of directoryFiles) {
    const key = path.resolve(item.path);
    if (!merged.has(key)) {
      merged.set(key, item);
    }
  }

  return {
    message: input.message,
    contextFiles: Array.from(merged.values()),
  };
}

function collectStorageContextFiles(baseDir: string): AgentContextFile[] {
  if (!fs.existsSync(baseDir)) {
    return [];
  }

  const files: AgentContextFile[] = [];
  const stack = [baseDir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const absolutePath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        stack.push(absolutePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const content = readTextFileForAgent(absolutePath);
      if (content === null) {
        continue;
      }

      files.push({
        path: absolutePath,
        content,
        previewKind: detectPreviewKind(absolutePath),
      });
    }
  }

  return files;
}

function readTextFileForAgent(filePath: string): string | null {
  try {
    const buffer = fs.readFileSync(filePath);
    if (buffer.includes(0)) {
      return null;
    }
    return buffer.toString('utf8');
  } catch {
    return null;
  }
}

async function collectAgentResponseText(input: AgentMessageInput): Promise<string> {
  const chunks: string[] = [];
  await streamAgentResponse(input, (chunk) => {
    if (chunk.type === 'chunk' && chunk.content) {
      chunks.push(chunk.content);
      return;
    }

    if (chunk.type === 'error') {
      throw new Error(chunk.message || 'Agent stream returned an error.');
    }
  });
  return chunks.join('').trim();
}

async function streamAgentResponse(
  input: AgentMessageInput,
  onChunk: (chunk: AgentStreamChunk) => void,
): Promise<void> {
  const response = await fetch(`${AGENT_SERVER_URL}/agent/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`Agent server returned ${response.status}`);
  }

  if (!response.body) {
    throw new Error('Agent stream response body is null');
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
      parseSseLine(line, onChunk);
    }
  }

  buffer += decoder.decode();
  if (buffer.trim().length > 0) {
    for (const line of buffer.split('\n')) {
      parseSseLine(line, onChunk);
    }
  }
}

function parseSseLine(line: string, onChunk: (chunk: AgentStreamChunk) => void): void {
  if (!line.startsWith('data: ')) {
    return;
  }

  const jsonStr = line.slice(6).trim();
  if (!jsonStr) {
    return;
  }

  let chunk: AgentStreamChunk;
  try {
    chunk = JSON.parse(jsonStr) as AgentStreamChunk;
  } catch (parseError) {
    console.error('Failed to parse SSE chunk:', parseError);
    return;
  }

  onChunk(chunk);
}

function resolveStorageBaseDir(): string {
  if (storageBaseDir) {
    return storageBaseDir;
  }
  return resolveDefaultStorageBaseDir();
}

function resolveDefaultStorageBaseDir(): string {
  return path.resolve(app.getAppPath(), 'tmp_projects');
}

function normalizeStorageBaseDir(rawDir: string): string {
  const trimmed = rawDir.trim();
  if (!trimmed) {
    throw new Error('Storage path cannot be empty.');
  }
  return path.resolve(trimmed);
}

function resolveConfigPath(): string {
  return path.join(app.getPath('userData'), 'panel-config.json');
}

function loadPanelConfig(): PanelConfig {
  const configPath = resolveConfigPath();
  if (!fs.existsSync(configPath)) {
    return {};
  }

  try {
    const content = fs.readFileSync(configPath, { encoding: 'utf8' });
    const parsed = JSON.parse(content) as PanelConfig;
    if (typeof parsed.storageBaseDir === 'string') {
      return parsed;
    }
    return {};
  } catch {
    return {};
  }
}

function savePanelConfig(config: PanelConfig): void {
  const configPath = resolveConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), { encoding: 'utf8' });
}

function buildExplorerNodes(dirPath: string): ExplorerNode[] {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const entries = fs
    .readdirSync(dirPath, { withFileTypes: true })
    .sort((left, right) => {
      if (left.isDirectory() && !right.isDirectory()) {
        return -1;
      }
      if (!left.isDirectory() && right.isDirectory()) {
        return 1;
      }
      return left.name.localeCompare(right.name, 'en');
    });

  const nodes: ExplorerNode[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path: absolutePath,
        kind: 'directory',
        children: buildExplorerNodes(absolutePath),
      });
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    nodes.push({
      name: entry.name,
      path: absolutePath,
      kind: 'file',
      previewKind: detectPreviewKind(absolutePath),
    });
  }

  return nodes;
}

function detectPreviewKind(filePath: string): PreviewKind {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.md') {
    return 'markdown';
  }
  if (ext === '.txt') {
    return 'text';
  }
  return 'unsupported';
}

function assertPathInsideStorage(rawPath: string): string {
  const baseDir = resolveStorageBaseDir();
  const absolutePath = path.resolve(rawPath);
  const relative = path.relative(baseDir, absolutePath);

  const isInside = relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  if (!isInside) {
    throw new Error(`Path outside storage root is not allowed: ${rawPath}`);
  }

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Path does not exist: ${rawPath}`);
  }

  return absolutePath;
}

function buildStubAgentReply(input: AgentMessageInput): AgentMessageOutput {
  const trimmed = input.message.trim();
  const contextCount = input.contextFiles.length;
  const contextLine =
    contextCount === 0
      ? 'No selected preview content was attached.'
      : `Received ${contextCount} context item(s): ${input.contextFiles
          .map((item) => path.basename(item.path))
          .join(', ')}.`;

  const echo = trimmed.length > 0 ? `Your message: "${trimmed}"` : 'Your message was empty.';
  return {
    role: 'agent',
    content: `[Stub Agent]\n${contextLine}\n${echo}\n\nThis is a placeholder for future plugin-backed agent integration.`,
    timestamp: new Date().toISOString(),
  };
}

async function openPanelFromClipboard(): Promise<void> {
  const text = clipboard.readText();
  panelState.content = text;
  panelState.title = 'untitled';
  await windowController.showPanel(text);
}

function startGlobalHotkeys(): void {
  const ok = globalHotkeyManager.start();
  if (!ok) {
    console.error(
      'Cannot start native key listener. Please run `npm run native:build` and grant Accessibility permission.',
    );
  }
}

function setupSignals(): void {
  const shutdown = (): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    globalHotkeyManager.stop();
    app.quit();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  app.on('before-quit', () => {
    windowController.setAllowClose(true);
    screenshotController.dispose();
    globalHotkeyManager.stop();
  });
}

async function bootstrap(): Promise<void> {
  if (process.platform !== 'darwin') {
    console.error('This sample only supports macOS.');
    process.exit(1);
  }

  const lock = app.requestSingleInstanceLock();
  if (!lock) {
    console.error('Another cc-ts instance is already running.');
    app.exit(1);
    return;
  }

  app.on('second-instance', () => {
    // Keep behavior deterministic: ignore duplicate launch attempts.
  });

  await app.whenReady();
  app.setName('Context Collector TS');
  const loadedConfig = loadPanelConfig();
  if (loadedConfig.storageBaseDir) {
    try {
      storageBaseDir = normalizeStorageBaseDir(loadedConfig.storageBaseDir);
    } catch {
      storageBaseDir = resolveDefaultStorageBaseDir();
    }
  } else {
    storageBaseDir = resolveDefaultStorageBaseDir();
  }
  fs.mkdirSync(storageBaseDir, { recursive: true });

  setupIpc();
  setupSignals();
  startGlobalHotkeys();

  console.log('Context Collector TS started.');
  console.log('- Double Cmd+C to open panel');
  console.log('- Double Option to open screenshot vision bar');
  console.log('- Cmd+S to save into cc-ts/tmp_projects/demo-temp');
  console.log('- Cmd+W to close panel');
  console.log('- Cmd+T to run transcript when vision bar is visible');
  console.log('- Cmd+N to start a new screenshot vision session');
}

void bootstrap();
