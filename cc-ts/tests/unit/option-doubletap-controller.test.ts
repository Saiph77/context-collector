import { describe, expect, it } from 'vitest';

import { OptionDoubleTapController } from '../../src/main/option-doubletap-controller';

const EVENT_FLAG_OPTION = 1 << 19;
const EVENT_FLAG_COMMAND = 1 << 20;

describe('OptionDoubleTapController', () => {
  it('triggers once when Option is released twice within threshold', () => {
    let now = 0;
    const calls: string[] = [];
    const controller = new OptionDoubleTapController({ nowMs: () => now });

    controller.handleFlagsChanged({ flags: EVENT_FLAG_OPTION }, { onTrigger: () => calls.push('open') });
    controller.handleFlagsChanged({ flags: 0 }, { onTrigger: () => calls.push('open') });

    now = 100;
    controller.handleFlagsChanged({ flags: EVENT_FLAG_OPTION }, { onTrigger: () => calls.push('open') });
    controller.handleFlagsChanged({ flags: 0 }, { onTrigger: () => calls.push('open') });

    expect(calls).toEqual(['open']);
  });

  it('does not trigger when interval exceeds threshold', () => {
    let now = 0;
    const calls: string[] = [];
    const controller = new OptionDoubleTapController({ nowMs: () => now });

    controller.handleFlagsChanged({ flags: EVENT_FLAG_OPTION }, { onTrigger: () => calls.push('open') });
    controller.handleFlagsChanged({ flags: 0 }, { onTrigger: () => calls.push('open') });

    now = 401;
    controller.handleFlagsChanged({ flags: EVENT_FLAG_OPTION }, { onTrigger: () => calls.push('open') });
    controller.handleFlagsChanged({ flags: 0 }, { onTrigger: () => calls.push('open') });

    expect(calls).toEqual([]);
  });

  it('debounces repeated triggers', () => {
    let now = 0;
    const calls: string[] = [];
    const controller = new OptionDoubleTapController({ nowMs: () => now });
    const actions = { onTrigger: () => calls.push('open') };

    controller.handleFlagsChanged({ flags: EVENT_FLAG_OPTION }, actions);
    controller.handleFlagsChanged({ flags: 0 }, actions);
    now = 100;
    controller.handleFlagsChanged({ flags: EVENT_FLAG_OPTION }, actions);
    controller.handleFlagsChanged({ flags: 0 }, actions);

    now = 200;
    controller.handleFlagsChanged({ flags: EVENT_FLAG_OPTION }, actions);
    controller.handleFlagsChanged({ flags: 0 }, actions);
    now = 250;
    controller.handleFlagsChanged({ flags: EVENT_FLAG_OPTION }, actions);
    controller.handleFlagsChanged({ flags: 0 }, actions);

    expect(calls).toEqual(['open']);
  });

  it('ignores Option transitions with other modifiers', () => {
    let now = 0;
    const calls: string[] = [];
    const controller = new OptionDoubleTapController({ nowMs: () => now });
    const actions = { onTrigger: () => calls.push('open') };

    controller.handleFlagsChanged({ flags: EVENT_FLAG_OPTION | EVENT_FLAG_COMMAND }, actions);
    controller.handleFlagsChanged({ flags: EVENT_FLAG_COMMAND }, actions);

    now = 100;
    controller.handleFlagsChanged({ flags: EVENT_FLAG_OPTION }, actions);
    controller.handleFlagsChanged({ flags: 0 }, actions);
    now = 200;
    controller.handleFlagsChanged({ flags: EVENT_FLAG_OPTION }, actions);
    controller.handleFlagsChanged({ flags: 0 }, actions);

    expect(calls).toEqual(['open']);
  });

  it('supports Cmd+Option double chord as trigger', () => {
    let now = 0;
    const calls: string[] = [];
    const controller = new OptionDoubleTapController({ nowMs: () => now });
    const actions = { onTrigger: () => calls.push('open') };

    controller.handleFlagsChanged({ flags: EVENT_FLAG_OPTION | EVENT_FLAG_COMMAND }, actions);
    controller.handleFlagsChanged({ flags: EVENT_FLAG_COMMAND }, actions);

    now = 120;
    controller.handleFlagsChanged({ flags: EVENT_FLAG_OPTION | EVENT_FLAG_COMMAND }, actions);
    controller.handleFlagsChanged({ flags: EVENT_FLAG_COMMAND }, actions);

    expect(calls).toEqual(['open']);
  });
});
