from __future__ import annotations

import time
from typing import Callable

import Quartz

from .config import DOUBLE_CMD_C_THRESHOLD


class DoubleCmdCListener:
    def __init__(
        self,
        on_trigger: Callable[[], None],
        threshold: float = DOUBLE_CMD_C_THRESHOLD,
        on_cmd_s: Callable[[], None] | None = None,
        on_cmd_w: Callable[[], None] | None = None,
        shortcut_enabled: Callable[[], bool] | None = None,
    ) -> None:
        self.on_trigger = on_trigger
        self.threshold = threshold
        self.on_cmd_s = on_cmd_s
        self.on_cmd_w = on_cmd_w
        self.shortcut_enabled = shortcut_enabled or (lambda: False)
        self.last_cmd_c_time = 0.0
        self._event_tap = None
        self._run_loop_source = None
        self._tap_callback = self._handle_event

    def start(self) -> bool:
        mask = Quartz.CGEventMaskBit(Quartz.kCGEventKeyDown)
        self._event_tap = Quartz.CGEventTapCreate(
            Quartz.kCGSessionEventTap,
            Quartz.kCGHeadInsertEventTap,
            Quartz.kCGEventTapOptionListenOnly,
            mask,
            self._tap_callback,
            None,
        )
        if not self._event_tap:
            return False

        self._run_loop_source = Quartz.CFMachPortCreateRunLoopSource(None, self._event_tap, 0)
        Quartz.CFRunLoopAddSource(
            Quartz.CFRunLoopGetCurrent(),
            self._run_loop_source,
            Quartz.kCFRunLoopCommonModes,
        )
        Quartz.CGEventTapEnable(self._event_tap, True)
        return True

    def stop(self) -> None:
        if self._event_tap and self._run_loop_source:
            Quartz.CFRunLoopRemoveSource(
                Quartz.CFRunLoopGetCurrent(),
                self._run_loop_source,
                Quartz.kCFRunLoopCommonModes,
            )
        if self._event_tap:
            Quartz.CFMachPortInvalidate(self._event_tap)
        self._event_tap = None
        self._run_loop_source = None

    def _handle_event(self, _proxy, event_type, event, _refcon):
        if event_type != Quartz.kCGEventKeyDown:
            return event

        keycode = Quartz.CGEventGetIntegerValueField(event, Quartz.kCGKeyboardEventKeycode)
        flags = Quartz.CGEventGetFlags(event)
        is_cmd = bool(flags & Quartz.kCGEventFlagMaskCommand)

        if is_cmd and self.shortcut_enabled():
            if keycode == 1 and self.on_cmd_s is not None:  # S
                self.on_cmd_s()
                return event
            if keycode == 13 and self.on_cmd_w is not None:  # W
                self.on_cmd_w()
                return event

        if keycode == 8 and is_cmd:  # C
            now = time.monotonic()
            if now - self.last_cmd_c_time <= self.threshold:
                self.last_cmd_c_time = 0.0
                self.on_trigger()
            else:
                self.last_cmd_c_time = now

        return event
