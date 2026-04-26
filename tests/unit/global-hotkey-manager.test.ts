import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

import { GlobalHotkeyManager } from '../../src/main/global-hotkey-manager';
import {
  HotkeyController,
  KEYCODE_B,
  KEYCODE_C,
  KEYCODE_S,
  KEYCODE_T,
  KEYCODE_W,
} from '../../src/main/hotkey-controller';
import { OptionDoubleTapController } from '../../src/main/option-doubletap-controller';

const EVENT_FLAG_OPTION = 1 << 19;
const EVENT_FLAG_COMMAND = 1 << 20;

class FakeNativeBridge extends EventEmitter {
  start = vi.fn(() => true);
  stop = vi.fn();
}

describe('GlobalHotkeyManager', () => {
  it('routes Cmd+S and Cmd+W through native global listener when panel is visible', () => {
    const bridge = new FakeNativeBridge();
    const hotkeyController = new HotkeyController({ nowMs: () => 0 });
    const onOpenPanel = vi.fn();
    const onSavePanel = vi.fn();
    const onClosePanel = vi.fn();
    const onToggleLeftSidebar = vi.fn();
    const onToggleRightSidebar = vi.fn();

    const manager = new GlobalHotkeyManager(bridge as never, hotkeyController, {
      isPanelVisible: () => true,
      onOpenPanel,
      onSavePanel,
      onClosePanel,
      onToggleLeftSidebar,
      onToggleRightSidebar,
    });

    expect(manager.start()).toBe(true);

    bridge.emit('keydown', { keycode: KEYCODE_S, flags: EVENT_FLAG_COMMAND, isCommand: true });
    bridge.emit('keydown', { keycode: KEYCODE_W, flags: EVENT_FLAG_COMMAND, isCommand: true });

    expect(onSavePanel).toHaveBeenCalledTimes(1);
    expect(onClosePanel).toHaveBeenCalledTimes(1);
  });

  it('does not route panel-only shortcuts when panel is hidden', () => {
    const bridge = new FakeNativeBridge();
    const onSavePanel = vi.fn();
    const manager = new GlobalHotkeyManager(
      bridge as never,
      new HotkeyController({ nowMs: () => 0 }),
      {
        isPanelVisible: () => false,
        onOpenPanel: vi.fn(),
        onSavePanel,
        onClosePanel: vi.fn(),
        onToggleLeftSidebar: vi.fn(),
        onToggleRightSidebar: vi.fn(),
      },
    );

    manager.start();
    bridge.emit('keydown', { keycode: KEYCODE_S, flags: EVENT_FLAG_COMMAND, isCommand: true });

    expect(onSavePanel).not.toHaveBeenCalled();
  });

  it('routes Cmd+B and Cmd+Option+B to different actions', () => {
    const bridge = new FakeNativeBridge();
    const onToggleLeftSidebar = vi.fn();
    const onToggleRightSidebar = vi.fn();
    const manager = new GlobalHotkeyManager(
      bridge as never,
      new HotkeyController({ nowMs: () => 0 }),
      {
        isPanelVisible: () => true,
        onOpenPanel: vi.fn(),
        onSavePanel: vi.fn(),
        onClosePanel: vi.fn(),
        onToggleLeftSidebar,
        onToggleRightSidebar,
      },
    );

    manager.start();
    bridge.emit('keydown', { keycode: KEYCODE_B, flags: EVENT_FLAG_COMMAND, isCommand: true });
    bridge.emit('keydown', {
      keycode: KEYCODE_B,
      flags: EVENT_FLAG_COMMAND | EVENT_FLAG_OPTION,
      isCommand: true,
    });

    expect(onToggleLeftSidebar).toHaveBeenCalledTimes(1);
    expect(onToggleRightSidebar).toHaveBeenCalledTimes(1);
  });

  it('supports extension via registerShortcut', () => {
    const bridge = new FakeNativeBridge();
    const onCustom = vi.fn();
    const manager = new GlobalHotkeyManager(
      bridge as never,
      new HotkeyController({ nowMs: () => 0 }),
      {
        isPanelVisible: () => true,
        onOpenPanel: vi.fn(),
        onSavePanel: vi.fn(),
        onClosePanel: vi.fn(),
        onToggleLeftSidebar: vi.fn(),
        onToggleRightSidebar: vi.fn(),
      },
    );

    manager.registerShortcut({
      id: 'panel.custom',
      keycode: 12,
      modifiers: ['command', 'shift'],
      handler: onCustom,
    });

    manager.start();
    bridge.emit('keydown', {
      keycode: 12,
      flags: EVENT_FLAG_COMMAND | (1 << 17),
      isCommand: true,
    });

    expect(onCustom).toHaveBeenCalledTimes(1);
  });

  it('keeps double Cmd+C behavior from HotkeyController', () => {
    let now = 0;
    const bridge = new FakeNativeBridge();
    const onOpenPanel = vi.fn();
    const manager = new GlobalHotkeyManager(
      bridge as never,
      new HotkeyController({ nowMs: () => now }),
      {
        isPanelVisible: () => false,
        onOpenPanel,
        onSavePanel: vi.fn(),
        onClosePanel: vi.fn(),
        onToggleLeftSidebar: vi.fn(),
        onToggleRightSidebar: vi.fn(),
      },
    );

    manager.start();
    bridge.emit('keydown', { keycode: KEYCODE_C, flags: EVENT_FLAG_COMMAND, isCommand: true });
    now = 100;
    bridge.emit('keydown', { keycode: KEYCODE_C, flags: EVENT_FLAG_COMMAND, isCommand: true });

    expect(onOpenPanel).toHaveBeenCalledTimes(1);
  });

  it('routes Cmd+T to transcript only when vision bar is visible', () => {
    const bridge = new FakeNativeBridge();
    const onVisionTranscript = vi.fn();
    const manager = new GlobalHotkeyManager(
      bridge as never,
      new HotkeyController({ nowMs: () => 0 }),
      {
        isPanelVisible: () => false,
        isVisionBarVisible: () => true,
        onOpenPanel: vi.fn(),
        onOpenVisionBar: vi.fn(),
        onVisionTranscript,
        onSavePanel: vi.fn(),
        onClosePanel: vi.fn(),
        onToggleLeftSidebar: vi.fn(),
        onToggleRightSidebar: vi.fn(),
      },
    );

    manager.start();
    bridge.emit('keydown', { keycode: KEYCODE_T, flags: EVENT_FLAG_COMMAND, isCommand: true });
    expect(onVisionTranscript).toHaveBeenCalledTimes(1);
  });

  it('routes Cmd+W to vision close when vision bar is visible', () => {
    const bridge = new FakeNativeBridge();
    const onCloseVision = vi.fn();
    const manager = new GlobalHotkeyManager(
      bridge as never,
      new HotkeyController({ nowMs: () => 0 }),
      {
        isPanelVisible: () => false,
        isVisionBarVisible: () => true,
        onOpenPanel: vi.fn(),
        onOpenVisionBar: vi.fn(),
        onVisionTranscript: vi.fn(),
        onCloseVision,
        onSavePanel: vi.fn(),
        onClosePanel: vi.fn(),
        onToggleLeftSidebar: vi.fn(),
        onToggleRightSidebar: vi.fn(),
      },
    );

    manager.start();
    bridge.emit('keydown', { keycode: KEYCODE_W, flags: EVENT_FLAG_COMMAND, isCommand: true });

    expect(onCloseVision).toHaveBeenCalledTimes(1);
  });

  it('routes double Option via flagschanged events', () => {
    let now = 0;
    const bridge = new FakeNativeBridge();
    const onOpenVisionBar = vi.fn();
    const manager = new GlobalHotkeyManager(
      bridge as never,
      new HotkeyController({ nowMs: () => 0 }),
      {
        isPanelVisible: () => false,
        onOpenPanel: vi.fn(),
        onOpenVisionBar,
        onSavePanel: vi.fn(),
        onClosePanel: vi.fn(),
        onToggleLeftSidebar: vi.fn(),
        onToggleRightSidebar: vi.fn(),
      },
      new OptionDoubleTapController({ nowMs: () => now }),
    );

    manager.start();
    bridge.emit('flagschanged', { flags: EVENT_FLAG_OPTION, isCommand: false, isOptionOnly: true });
    bridge.emit('flagschanged', { flags: 0, isCommand: false, isOptionOnly: false });
    now = 100;
    bridge.emit('flagschanged', { flags: EVENT_FLAG_OPTION, isCommand: false, isOptionOnly: true });
    bridge.emit('flagschanged', { flags: 0, isCommand: false, isOptionOnly: false });

    expect(onOpenVisionBar).toHaveBeenCalledTimes(1);
  });
});
