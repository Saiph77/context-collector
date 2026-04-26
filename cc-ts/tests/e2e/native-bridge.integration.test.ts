import { describe, expect, it, vi } from 'vitest';

import { NativeBridge, type NativeAddon } from '../../src/main/native-bridge';

describe('main + native bridge integration', () => {
  it('starts native listener and forwards keydown events', () => {
    let listener: ((event: { keycode: number; flags: number; isCommand: boolean }) => void) | null = null;

    const addon: NativeAddon = {
      startKeyListener: (cb) => {
        listener = cb;
        return true;
      },
      stopKeyListener: vi.fn(),
      prepareOverlayMode: vi.fn(),
      promoteToOverlay: vi.fn(() => true),
    };

    const bridge = new NativeBridge(addon);

    const received: number[] = [];
    bridge.on('keydown', (event) => {
      received.push(event.keycode);
    });

    expect(bridge.start()).toBe(true);
    expect(listener).not.toBeNull();

    listener?.({ keycode: 8, flags: 0, isCommand: true });
    listener?.({ keycode: 1, flags: 0, isCommand: true });

    expect(received).toEqual([8, 1]);

    bridge.stop();
    expect(addon.stopKeyListener).toHaveBeenCalledTimes(1);
  });

  it('forwards flagschanged events separately', () => {
    let listener: ((event: { flags: number; eventType?: string }) => void) | null = null;

    const addon: NativeAddon = {
      startKeyListener: (cb) => {
        listener = cb as (event: { flags: number; eventType?: string }) => void;
        return true;
      },
      stopKeyListener: vi.fn(),
      prepareOverlayMode: vi.fn(),
      promoteToOverlay: vi.fn(() => true),
    };

    const bridge = new NativeBridge(addon);
    const received: number[] = [];
    bridge.on('flagschanged', (event: { flags: number }) => {
      received.push(event.flags);
    });

    expect(bridge.start()).toBe(true);
    listener?.({ flags: 1 << 19, eventType: 'flagsChanged' });
    listener?.({ flags: 0, eventType: 'flagsChanged' });

    expect(received).toEqual([1 << 19, 0]);
    bridge.stop();
  });
});
