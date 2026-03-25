import { describe, expect, it } from 'vitest';

import {
  HotkeyController,
  KEYCODE_C,
  KEYCODE_S,
  KEYCODE_W,
} from '../../src/main/hotkey-controller';

describe('double Cmd+C state machine', () => {
  it('triggers open when two Cmd+C are <= 400ms apart', () => {
    let now = 0;
    const calls: string[] = [];
    const controller = new HotkeyController({ nowMs: () => now });

    const actions = {
      onOpenPanel: () => calls.push('open'),
      onSavePanel: () => calls.push('save'),
      onClosePanel: () => calls.push('close'),
    };

    controller.handleKeyEvent({ keycode: KEYCODE_C, flags: 0, isCommand: true }, false, actions);
    now = 400;
    controller.handleKeyEvent({ keycode: KEYCODE_C, flags: 0, isCommand: true }, false, actions);

    expect(calls).toEqual(['open']);
  });

  it('does not trigger open when interval is > 400ms', () => {
    let now = 0;
    const calls: string[] = [];
    const controller = new HotkeyController({ nowMs: () => now });

    const actions = {
      onOpenPanel: () => calls.push('open'),
      onSavePanel: () => calls.push('save'),
      onClosePanel: () => calls.push('close'),
    };

    controller.handleKeyEvent({ keycode: KEYCODE_C, flags: 0, isCommand: true }, false, actions);
    now = 401;
    controller.handleKeyEvent({ keycode: KEYCODE_C, flags: 0, isCommand: true }, false, actions);

    expect(calls).toEqual([]);
  });

  it('drops second open request within 350ms debounce window', () => {
    let now = 0;
    const calls: string[] = [];
    const controller = new HotkeyController({ nowMs: () => now });

    const actions = {
      onOpenPanel: () => calls.push('open'),
      onSavePanel: () => calls.push('save'),
      onClosePanel: () => calls.push('close'),
    };

    // first trigger
    controller.handleKeyEvent({ keycode: KEYCODE_C, flags: 0, isCommand: true }, false, actions);
    now = 100;
    controller.handleKeyEvent({ keycode: KEYCODE_C, flags: 0, isCommand: true }, false, actions);

    // second trigger attempt inside debounce
    now = 200;
    controller.handleKeyEvent({ keycode: KEYCODE_C, flags: 0, isCommand: true }, false, actions);
    now = 250;
    controller.handleKeyEvent({ keycode: KEYCODE_C, flags: 0, isCommand: true }, false, actions);

    expect(calls).toEqual(['open']);
  });

  it('routes Cmd+S/Cmd+W only when panel is visible', () => {
    let now = 0;
    const calls: string[] = [];
    const controller = new HotkeyController({ nowMs: () => now });

    const actions = {
      onOpenPanel: () => calls.push('open'),
      onSavePanel: () => calls.push('save'),
      onClosePanel: () => calls.push('close'),
    };

    controller.handleKeyEvent({ keycode: KEYCODE_S, flags: 0, isCommand: true }, false, actions);
    controller.handleKeyEvent({ keycode: KEYCODE_W, flags: 0, isCommand: true }, false, actions);
    expect(calls).toEqual([]);

    now += 1;
    controller.handleKeyEvent({ keycode: KEYCODE_S, flags: 0, isCommand: true }, true, actions);
    controller.handleKeyEvent({ keycode: KEYCODE_W, flags: 0, isCommand: true }, true, actions);
    expect(calls).toEqual(['save', 'close']);
  });
});
