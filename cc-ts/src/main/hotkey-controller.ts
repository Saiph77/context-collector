export const KEYCODE_C = 8;
export const KEYCODE_S = 1;
export const KEYCODE_B = 11;
export const KEYCODE_W = 13;
export const KEYCODE_T = 17;
export const KEYCODE_N = 45;

export const DOUBLE_CMD_C_THRESHOLD_MS = 400;
export const OPEN_DEBOUNCE_MS = 350;

export interface KeyEvent {
  keycode: number;
  flags: number;
  isCommand: boolean;
  timestampMs: number;
}

export interface HotkeyActions {
  onOpenPanel: () => void;
}

export interface HotkeyControllerOptions {
  nowMs?: () => number;
  doubleCmdCThresholdMs?: number;
  openDebounceMs?: number;
}

export class HotkeyController {
  private readonly nowMs: () => number;
  private readonly doubleCmdCThresholdMs: number;
  private readonly openDebounceMs: number;
  private lastCmdCTimeMs = -1;
  private lastOpenTimeMs = -1;

  constructor(options: HotkeyControllerOptions = {}) {
    this.nowMs = options.nowMs ?? (() => Date.now());
    this.doubleCmdCThresholdMs = options.doubleCmdCThresholdMs ?? DOUBLE_CMD_C_THRESHOLD_MS;
    this.openDebounceMs = options.openDebounceMs ?? OPEN_DEBOUNCE_MS;
  }

  handleKeyEvent(event: Omit<KeyEvent, 'timestampMs'>, actions: HotkeyActions): void {
    const timestampMs = this.nowMs();

    if (!(event.isCommand && event.keycode === KEYCODE_C)) {
      return;
    }

    if (this.lastCmdCTimeMs >= 0 && timestampMs - this.lastCmdCTimeMs <= this.doubleCmdCThresholdMs) {
      this.lastCmdCTimeMs = -1;
      if (this.lastOpenTimeMs >= 0 && timestampMs - this.lastOpenTimeMs < this.openDebounceMs) {
        return;
      }
      this.lastOpenTimeMs = timestampMs;
      actions.onOpenPanel();
      return;
    }

    this.lastCmdCTimeMs = timestampMs;
  }
}
