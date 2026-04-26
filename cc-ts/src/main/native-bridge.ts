import path from 'node:path';
import { EventEmitter } from 'node:events';
import type { BrowserWindow } from 'electron';

export interface NativeKeyEvent {
  keycode: number;
  flags: number;
  isCommand: boolean;
  isOptionOnly?: boolean;
  eventType?: 'keyDown' | 'flagsChanged';
}

export interface NativeAddon {
  startKeyListener: (listener: (event: NativeKeyEvent) => void) => boolean;
  stopKeyListener: () => void;
  prepareOverlayMode: () => void;
  promoteToOverlay: (nativeWindowHandle: Buffer) => boolean;
}

function resolveNativeAddon(): NativeAddon | null {
  const candidates = [
    path.resolve(process.cwd(), 'node_modules', 'cc_native_bridge'),
    path.resolve(process.cwd(), 'native', 'cc_native_bridge'),
    path.resolve(__dirname, '..', '..', 'native', 'cc_native_bridge'),
  ];

  for (const candidate of candidates) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const loaded = require(candidate) as NativeAddon;
      if (
        typeof loaded.startKeyListener === 'function' &&
        typeof loaded.stopKeyListener === 'function' &&
        typeof loaded.prepareOverlayMode === 'function' &&
        typeof loaded.promoteToOverlay === 'function'
      ) {
        return loaded;
      }
    } catch {
      // Keep trying next candidate.
    }
  }

  return null;
}

export class NativeBridge extends EventEmitter {
  private readonly addon: NativeAddon | null;
  private started = false;

  constructor(addonOverride?: NativeAddon | null) {
    super();
    this.addon = addonOverride ?? resolveNativeAddon();
  }

  start(): boolean {
    if (!this.addon) {
      return false;
    }

    if (this.started) {
      return true;
    }

    const ok = this.addon.startKeyListener((event) => {
      const eventType = event.eventType ?? 'keyDown';
      if (eventType === 'flagsChanged') {
        this.emit('flagschanged', event);
        return;
      }
      this.emit('keydown', event);
    });

    this.started = ok;
    return ok;
  }

  stop(): void {
    if (!this.addon || !this.started) {
      return;
    }
    this.addon.stopKeyListener();
    this.started = false;
  }

  prepareOverlayMode(): void {
    if (this.addon) {
      this.addon.prepareOverlayMode();
      return;
    }
  }

  promoteToOverlay(win: BrowserWindow): boolean {
    if (!this.addon) {
      return false;
    }

    try {
      const handle = win.getNativeWindowHandle();
      return this.addon.promoteToOverlay(handle);
    } catch {
      return false;
    }
  }

  hasNativeAddon(): boolean {
    return this.addon !== null;
  }
}
