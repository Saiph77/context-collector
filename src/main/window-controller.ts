import path from 'node:path';
import { BrowserWindow, app, screen } from 'electron';

import type { NativeBridge } from './native-bridge';
import { calculateCenteredBounds } from './position';

export const WINDOW_WIDTH = 860;
export const WINDOW_HEIGHT = 520;

export class WindowController {
  private win: BrowserWindow | null = null;
  private firstOverlayPrepared = false;
  private allowClose = false;

  constructor(private readonly nativeBridge: NativeBridge) {}

  isVisible(): boolean {
    return this.win !== null && !this.win.isDestroyed() && this.win.isVisible();
  }

  async showPanel(text: string): Promise<void> {
    if (!this.firstOverlayPrepared) {
      this.nativeBridge.prepareOverlayMode();
      this.firstOverlayPrepared = true;
    }

    const win = await this.ensureWindow();

    this.placeNearCursor(win);

    if (!win.isVisible()) {
      win.show();
    }

    this.applyOverlay(win);
    this.placeNearCursor(win);

    win.webContents.send('panel:present', { text });
    win.webContents.send('panel:focus-title');

    win.focus();
  }

  hidePanel(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.hide();
    }
  }

  setAllowClose(allowClose: boolean): void {
    this.allowClose = allowClose;
  }

  onSaveResult(savedPath: string): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send('panel:saved', { path: savedPath });
    }
  }

  toggleLeftSidebar(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send('panel:toggle-left-sidebar');
    }
  }

  toggleRightSidebar(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send('panel:toggle-right-sidebar');
    }
  }

  private async ensureWindow(): Promise<BrowserWindow> {
    if (this.win && !this.win.isDestroyed()) {
      return this.win;
    }

    const preloadPath = path.join(__dirname, '..', 'preload', 'index.js');
    const rendererHtml = path.join(app.getAppPath(), 'dist', 'renderer', 'index.html');

    const win = new BrowserWindow({
      width: WINDOW_WIDTH,
      height: WINDOW_HEIGHT,
      show: false,
      resizable: true,
      fullscreenable: false,
      autoHideMenuBar: true,
      alwaysOnTop: true,
      title: 'Context Collector TS',
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

  private placeNearCursor(win: BrowserWindow): void {
    const cursorPoint = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursorPoint);
    const bounds = calculateCenteredBounds(cursorPoint, display.workArea, WINDOW_WIDTH, WINDOW_HEIGHT);
    win.setBounds(bounds, false);
  }

  private applyOverlay(win: BrowserWindow): void {
    const promoted = this.nativeBridge.promoteToOverlay(win);

    if (!promoted) {
      // Electron fallback behavior if native window promotion is unavailable.
      app.setActivationPolicy('accessory');
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: false });
      win.setAlwaysOnTop(true, 'screen-saver', 1);
      win.moveTop();
      win.showInactive();
    }
  }
}
