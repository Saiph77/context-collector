import path from 'node:path';

import { BrowserWindow, app, screen } from 'electron';

import type { NativeBridge } from './native-bridge';

export const SCREENSHOT_BAR_WIDTH = 980;
export const SCREENSHOT_BAR_HEIGHT = 340;
const SCREENSHOT_BAR_MIN_WIDTH = 760;
const SCREENSHOT_BAR_MIN_HEIGHT = 240;
const SCREENSHOT_BAR_BOTTOM_OFFSET = 56;

export class ScreenshotBarWindow {
  private win: BrowserWindow | null = null;
  private overlayPrepared = false;
  private allowClose = false;
  private hasPositionedOnce = false;

  constructor(private readonly nativeBridge: NativeBridge) {}

  isVisible(): boolean {
    return this.win !== null && !this.win.isDestroyed() && this.win.isVisible();
  }

  async show(): Promise<void> {
    if (!this.overlayPrepared) {
      this.nativeBridge.prepareOverlayMode();
      this.overlayPrepared = true;
    }

    const win = await this.ensureWindow();
    if (!this.hasPositionedOnce) {
      this.positionAtBottomCenter(win);
      this.hasPositionedOnce = true;
    }

    if (!win.isVisible()) {
      win.show();
    }

    this.applyOverlay(win);
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

  private async ensureWindow(): Promise<BrowserWindow> {
    if (this.win && !this.win.isDestroyed()) {
      return this.win;
    }

    const preloadPath = path.join(__dirname, '..', 'preload', 'screenshot-preload.js');
    const rendererHtml = path.join(app.getAppPath(), 'dist', 'renderer', 'screenshot-bar', 'index.html');

    const win = new BrowserWindow({
      width: SCREENSHOT_BAR_WIDTH,
      height: SCREENSHOT_BAR_HEIGHT,
      show: false,
      frame: false,
      transparent: true,
      hasShadow: true,
      resizable: true,
      movable: true,
      minWidth: SCREENSHOT_BAR_MIN_WIDTH,
      minHeight: SCREENSHOT_BAR_MIN_HEIGHT,
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
      this.hasPositionedOnce = false;
      this.win = null;
    });

    await win.loadFile(rendererHtml);
    this.win = win;
    return win;
  }

  private positionAtBottomCenter(win: BrowserWindow): void {
    const cursorPoint = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursorPoint);
    const workArea = display.workArea;
    const current = win.getBounds();

    const x = Math.round(workArea.x + (workArea.width - current.width) / 2);
    const y = Math.round(workArea.y + workArea.height - current.height - SCREENSHOT_BAR_BOTTOM_OFFSET);

    const nextBounds = {
      x,
      y,
      width: current.width,
      height: current.height,
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

  private applyOverlay(win: BrowserWindow): void {
    const promoted = this.nativeBridge.promoteToOverlay(win);
    if (!promoted) {
      app.setActivationPolicy('accessory');
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: false });
      win.setAlwaysOnTop(true, 'screen-saver', 1);
      win.moveTop();
      win.showInactive();
    }
  }
}
