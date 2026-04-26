import path from 'node:path';

import { BrowserWindow, app, screen } from 'electron';

export const CHAT_DIALOG_WIDTH = 760;
export const CHAT_DIALOG_HEIGHT = 460;
const CHAT_DIALOG_MIN_WIDTH = 520;
const CHAT_DIALOG_MIN_HEIGHT = 260;
const CHAT_DIALOG_GAP = 20;

export class ChatDialogWindow {
  private win: BrowserWindow | null = null;
  private allowClose = false;

  isVisible(): boolean {
    return this.win !== null && !this.win.isDestroyed() && this.win.isVisible();
  }

  async showAbove(anchorBounds: Electron.Rectangle): Promise<void> {
    const win = await this.ensureWindow();
    this.positionAboveAnchor(win, anchorBounds);
    if (!win.isVisible()) {
      win.show();
    }
    win.focus();
  }

  hide(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.hide();
    }
  }

  setAllowClose(allowClose: boolean): void {
    this.allowClose = allowClose;
  }

  getBounds(): Electron.Rectangle | null {
    if (!this.win || this.win.isDestroyed()) {
      return null;
    }
    return this.win.getBounds();
  }

  send(channel: string, payload: unknown): void {
    if (!this.win || this.win.isDestroyed()) {
      return;
    }
    this.win.webContents.send(channel, payload);
  }

  async ensureReady(): Promise<void> {
    await this.ensureWindow();
  }

  repositionAbove(anchorBounds: Electron.Rectangle): void {
    if (!this.win || this.win.isDestroyed() || !this.win.isVisible()) {
      return;
    }
    this.positionAboveAnchor(this.win, anchorBounds);
  }

  private async ensureWindow(): Promise<BrowserWindow> {
    if (this.win && !this.win.isDestroyed()) {
      return this.win;
    }

    const preloadPath = path.join(__dirname, '..', 'preload', 'screenshot-preload.js');
    const rendererHtml = path.join(app.getAppPath(), 'dist', 'renderer', 'chat-dialog', 'index.html');

    const win = new BrowserWindow({
      width: CHAT_DIALOG_WIDTH,
      height: CHAT_DIALOG_HEIGHT,
      show: false,
      frame: false,
      transparent: true,
      hasShadow: true,
      resizable: true,
      movable: true,
      minWidth: CHAT_DIALOG_MIN_WIDTH,
      minHeight: CHAT_DIALOG_MIN_HEIGHT,
      fullscreenable: false,
      autoHideMenuBar: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    win.on('close', (event) => {
      if (!this.allowClose) {
        event.preventDefault();
        win.hide();
      }
    });

    win.once('closed', () => {
      this.win = null;
    });

    await win.loadFile(rendererHtml);
    this.win = win;
    return win;
  }

  private positionAboveAnchor(win: BrowserWindow, anchorBounds: Electron.Rectangle): void {
    const display = screen.getDisplayMatching(anchorBounds);
    const workArea = display.workArea;
    const current = win.getBounds();

    const nextWidth = current.width;
    const nextHeight = current.height;
    const preferredX = Math.round(anchorBounds.x + (anchorBounds.width - nextWidth) / 2);
    const preferredY = Math.round(anchorBounds.y - nextHeight - CHAT_DIALOG_GAP);
    const minX = workArea.x;
    const minY = workArea.y;
    const maxX = workArea.x + workArea.width - nextWidth;
    const maxY = workArea.y + workArea.height - nextHeight;

    const x = clamp(preferredX, minX, maxX);
    const y = clamp(preferredY, minY, maxY);

    const nextBounds = {
      x,
      y,
      width: nextWidth,
      height: nextHeight,
    };

    if (
      current.x === nextBounds.x &&
      current.y === nextBounds.y &&
      current.width === nextBounds.width &&
      current.height === nextBounds.height
    ) {
      return;
    }

    win.setBounds(nextBounds, false);
  }
}

function clamp(value: number, min: number, max: number): number {
  if (min > max) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}
