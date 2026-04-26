import {
  HotkeyController,
  KEYCODE_B,
  KEYCODE_N,
  KEYCODE_S,
  KEYCODE_T,
  KEYCODE_W,
} from './hotkey-controller';
import type { NativeBridge, NativeKeyEvent } from './native-bridge';
import { OptionDoubleTapController } from './option-doubletap-controller';

type HotkeyScope = 'always' | 'panelVisible' | 'visionVisible';
type HotkeyModifier = 'command' | 'option' | 'shift' | 'control';

const EVENT_FLAG_SHIFT = 1 << 17;
const EVENT_FLAG_CONTROL = 1 << 18;
const EVENT_FLAG_OPTION = 1 << 19;
const EVENT_FLAG_COMMAND = 1 << 20;

export interface GlobalHotkeyHandlers {
  isPanelVisible: () => boolean;
  isVisionBarVisible?: () => boolean;
  onOpenPanel: () => void;
  onOpenVisionBar?: () => void;
  onVisionTranscript?: () => void;
  onVisionNewSession?: () => void;
  onCloseVision?: () => void;
  onSavePanel: () => void;
  onClosePanel: () => void;
  onToggleLeftSidebar: () => void;
  onToggleRightSidebar: () => void;
}

export interface HotkeyDefinition {
  id: string;
  keycode: number;
  modifiers: HotkeyModifier[];
  scope?: HotkeyScope;
  allowExtraModifiers?: boolean;
  handler: () => void;
}

export class GlobalHotkeyManager {
  private readonly shortcuts = new Map<string, HotkeyDefinition>();
  private readonly onKeydown = (event: NativeKeyEvent): void => {
    this.handleNativeKeydown(event);
  };
  private readonly onFlagsChanged = (event: NativeKeyEvent): void => {
    this.handleNativeFlagsChanged(event);
  };
  private started = false;
  private readonly optionDoubleTapController: OptionDoubleTapController;

  constructor(
    private readonly nativeBridge: NativeBridge,
    private readonly hotkeyController: HotkeyController,
    private readonly handlers: GlobalHotkeyHandlers,
    optionDoubleTapController?: OptionDoubleTapController,
  ) {
    this.optionDoubleTapController = optionDoubleTapController ?? new OptionDoubleTapController();
    this.registerDefaults();
  }

  registerShortcut(definition: HotkeyDefinition): () => void {
    if (this.shortcuts.has(definition.id)) {
      throw new Error(`Duplicate hotkey id: ${definition.id}`);
    }

    this.shortcuts.set(definition.id, definition);
    return () => {
      this.shortcuts.delete(definition.id);
    };
  }

  start(): boolean {
    if (this.started) {
      return true;
    }

    this.nativeBridge.on('keydown', this.onKeydown);
    this.nativeBridge.on('flagschanged', this.onFlagsChanged);
    const ok = this.nativeBridge.start();
    if (!ok) {
      this.nativeBridge.removeListener('keydown', this.onKeydown);
      this.nativeBridge.removeListener('flagschanged', this.onFlagsChanged);
      return false;
    }

    this.started = true;
    return true;
  }

  stop(): void {
    if (!this.started) {
      return;
    }

    this.nativeBridge.removeListener('keydown', this.onKeydown);
    this.nativeBridge.removeListener('flagschanged', this.onFlagsChanged);
    this.nativeBridge.stop();
    this.started = false;
  }

  private registerDefaults(): void {
    this.registerShortcut({
      id: 'panel.save',
      keycode: KEYCODE_S,
      modifiers: ['command'],
      scope: 'panelVisible',
      handler: this.handlers.onSavePanel,
    });

    this.registerShortcut({
      id: 'panel.close',
      keycode: KEYCODE_W,
      modifiers: ['command'],
      scope: 'panelVisible',
      handler: this.handlers.onClosePanel,
    });

    this.registerShortcut({
      id: 'panel.toggle-left-sidebar',
      keycode: KEYCODE_B,
      modifiers: ['command'],
      scope: 'panelVisible',
      handler: this.handlers.onToggleLeftSidebar,
    });

    this.registerShortcut({
      id: 'panel.toggle-right-sidebar',
      keycode: KEYCODE_B,
      modifiers: ['command', 'option'],
      scope: 'panelVisible',
      handler: this.handlers.onToggleRightSidebar,
    });

    this.registerShortcut({
      id: 'vision.transcript',
      keycode: KEYCODE_T,
      modifiers: ['command'],
      scope: 'visionVisible',
      handler: () => this.handlers.onVisionTranscript?.(),
    });

    this.registerShortcut({
      id: 'vision.new-session',
      keycode: KEYCODE_N,
      modifiers: ['command'],
      scope: 'visionVisible',
      handler: () => this.handlers.onVisionNewSession?.(),
    });

    this.registerShortcut({
      id: 'vision.close',
      keycode: KEYCODE_W,
      modifiers: ['command'],
      scope: 'visionVisible',
      handler: () => this.handlers.onCloseVision?.(),
    });
  }

  private handleNativeKeydown(event: NativeKeyEvent): void {
    this.hotkeyController.handleKeyEvent(event, {
      onOpenPanel: this.handlers.onOpenPanel,
    });

    for (const shortcut of this.shortcuts.values()) {
      if (!this.matchesScope(shortcut.scope)) {
        continue;
      }

      if (!this.matchesShortcut(shortcut, event)) {
        continue;
      }

      shortcut.handler();
      return;
    }
  }

  private handleNativeFlagsChanged(event: NativeKeyEvent): void {
    this.optionDoubleTapController.handleFlagsChanged(event, {
      onTrigger: () => {
        this.handlers.onOpenVisionBar?.();
      },
    });
  }

  private matchesScope(scope: HotkeyScope | undefined): boolean {
    if (scope === 'panelVisible') {
      return this.handlers.isPanelVisible();
    }
    if (scope === 'visionVisible') {
      return this.handlers.isVisionBarVisible ? this.handlers.isVisionBarVisible() : false;
    }
    return true;
  }

  private matchesShortcut(shortcut: HotkeyDefinition, event: NativeKeyEvent): boolean {
    if (shortcut.keycode !== event.keycode) {
      return false;
    }

    const active = extractModifiers(event);
    const required = new Set(shortcut.modifiers);
    for (const modifier of required) {
      if (!active.has(modifier)) {
        return false;
      }
    }

    if (!shortcut.allowExtraModifiers && active.size !== required.size) {
      return false;
    }

    return true;
  }
}

function extractModifiers(event: NativeKeyEvent): Set<HotkeyModifier> {
  const modifiers = new Set<HotkeyModifier>();
  const flags = event.flags;

  if (event.isCommand || hasFlag(flags, EVENT_FLAG_COMMAND)) {
    modifiers.add('command');
  }
  if (hasFlag(flags, EVENT_FLAG_OPTION)) {
    modifiers.add('option');
  }
  if (hasFlag(flags, EVENT_FLAG_SHIFT)) {
    modifiers.add('shift');
  }
  if (hasFlag(flags, EVENT_FLAG_CONTROL)) {
    modifiers.add('control');
  }

  return modifiers;
}

function hasFlag(flags: number, flag: number): boolean {
  return (flags & flag) !== 0;
}
