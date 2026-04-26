export const DOUBLE_OPTION_THRESHOLD_MS = 400;
export const OPTION_DEBOUNCE_MS = 350;

const EVENT_FLAG_SHIFT = 1 << 17;
const EVENT_FLAG_CONTROL = 1 << 18;
const EVENT_FLAG_OPTION = 1 << 19;

export interface OptionFlagsEvent {
  flags: number;
  isOptionOnly?: boolean;
}

export interface OptionActions {
  onTrigger: () => void;
}

export interface OptionDoubleTapControllerOptions {
  nowMs?: () => number;
  doubleOptionThresholdMs?: number;
  optionDebounceMs?: number;
}

export class OptionDoubleTapController {
  private readonly nowMs: () => number;
  private readonly doubleOptionThresholdMs: number;
  private readonly optionDebounceMs: number;

  private wasOptionChordDown = false;
  private lastOptionReleaseMs = -1;
  private lastTriggerMs = -1;

  constructor(options: OptionDoubleTapControllerOptions = {}) {
    this.nowMs = options.nowMs ?? (() => Date.now());
    this.doubleOptionThresholdMs = options.doubleOptionThresholdMs ?? DOUBLE_OPTION_THRESHOLD_MS;
    this.optionDebounceMs = options.optionDebounceMs ?? OPTION_DEBOUNCE_MS;
  }

  handleFlagsChanged(event: OptionFlagsEvent, actions: OptionActions): void {
    const nowMs = this.nowMs();
    const flags = event.flags;
    const optionDown = hasFlag(flags, EVENT_FLAG_OPTION);
    const optionChordDown =
      event.isOptionOnly ??
      (optionDown && !hasFlag(flags, EVENT_FLAG_SHIFT | EVENT_FLAG_CONTROL));

    if (optionChordDown) {
      this.wasOptionChordDown = true;
      return;
    }

    if (optionDown) {
      this.wasOptionChordDown = false;
      return;
    }

    if (!this.wasOptionChordDown) {
      return;
    }

    this.wasOptionChordDown = false;

    if (this.lastOptionReleaseMs >= 0 && nowMs - this.lastOptionReleaseMs <= this.doubleOptionThresholdMs) {
      this.lastOptionReleaseMs = -1;
      if (this.lastTriggerMs >= 0 && nowMs - this.lastTriggerMs < this.optionDebounceMs) {
        return;
      }
      this.lastTriggerMs = nowMs;
      actions.onTrigger();
      return;
    }

    this.lastOptionReleaseMs = nowMs;
  }
}

function hasFlag(flags: number, mask: number): boolean {
  return (flags & mask) !== 0;
}
