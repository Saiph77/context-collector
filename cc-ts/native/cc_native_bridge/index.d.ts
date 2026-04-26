export interface NativeKeyEvent {
  keycode: number;
  flags: number;
  isCommand: boolean;
  isOptionOnly?: boolean;
  eventType?: 'keyDown' | 'flagsChanged';
}

export type NativeKeyListener = (event: NativeKeyEvent) => void;

export function startKeyListener(listener: NativeKeyListener): boolean;
export function stopKeyListener(): void;
export function prepareOverlayMode(): void;
export function promoteToOverlay(nativeWindowHandle: Buffer): boolean;
