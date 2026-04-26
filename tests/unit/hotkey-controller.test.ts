import { describe, expect, it } from 'vitest';

import {
  HotkeyController,
  KEYCODE_C,
} from '../../src/main/hotkey-controller';

describe('double Cmd+C state machine', () => {
  it('triggers open when two Cmd+C are <= 400ms apart', () => {
    let now = 0;
    const calls: string[] = [];
    const controller = new HotkeyController({ nowMs: () => now });

    const actions = {
      onOpenPanel: () => calls.push('open'),
    };

    controller.handleKeyEvent({ keycode: KEYCODE_C, flags: 0, isCommand: true }, actions);
    now = 400;
    controller.handleKeyEvent({ keycode: KEYCODE_C, flags: 0, isCommand: true }, actions);

    expect(calls).toEqual(['open']);
  });

  it('does not trigger open when interval is > 400ms', () => {
    let now = 0;
    const calls: string[] = [];
    const controller = new HotkeyController({ nowMs: () => now });

    const actions = {
      onOpenPanel: () => calls.push('open'),
    };

    controller.handleKeyEvent({ keycode: KEYCODE_C, flags: 0, isCommand: true }, actions);
    now = 401;
    controller.handleKeyEvent({ keycode: KEYCODE_C, flags: 0, isCommand: true }, actions);

    expect(calls).toEqual([]);
  });

  it('drops second open request within 350ms debounce window', () => {
    let now = 0;
    const calls: string[] = [];
    const controller = new HotkeyController({ nowMs: () => now });

    const actions = {
      onOpenPanel: () => calls.push('open'),
    };

    // first trigger
    controller.handleKeyEvent({ keycode: KEYCODE_C, flags: 0, isCommand: true }, actions);
    now = 100;
    controller.handleKeyEvent({ keycode: KEYCODE_C, flags: 0, isCommand: true }, actions);

    // second trigger attempt inside debounce
    now = 200;
    controller.handleKeyEvent({ keycode: KEYCODE_C, flags: 0, isCommand: true }, actions);
    now = 250;
    controller.handleKeyEvent({ keycode: KEYCODE_C, flags: 0, isCommand: true }, actions);

    expect(calls).toEqual(['open']);
  });

  it('ignores unrelated keycodes', () => {
    let now = 0;
    const calls: string[] = [];
    const controller = new HotkeyController({ nowMs: () => now });

    const actions = {
      onOpenPanel: () => calls.push('open'),
    };

    now += 1;
    controller.handleKeyEvent({ keycode: 99, flags: 0, isCommand: true }, actions);
    controller.handleKeyEvent({ keycode: 8, flags: 0, isCommand: false }, actions);
    expect(calls).toEqual([]);
  });
});
