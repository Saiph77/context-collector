from __future__ import annotations

import ctypes

import AppKit
import Quartz
import objc


def prepare_overlay_mode() -> None:
    app = AppKit.NSApplication.sharedApplication()
    app.setActivationPolicy_(AppKit.NSApplicationActivationPolicyAccessory)


def _window_from_qt_widget(widget):
    ptr = int(widget.winId())
    if ptr <= 0:
        return None

    candidates = [ptr, ctypes.c_void_p(ptr)]
    for candidate in candidates:
        try:
            ns_view = objc.objc_object(c_void_p=candidate)
            ns_window = ns_view.window()
            if ns_window is not None:
                return ns_window
        except Exception:
            continue

    return None


def promote_to_overlay(widget) -> bool:
    ns_window = _window_from_qt_widget(widget)
    if ns_window is None:
        return False

    prepare_overlay_mode()

    # Prefer moving the window into the currently active Space before showing.
    # Note: MoveToActiveSpace cannot be combined with CanJoinAllSpaces.
    behaviors = [
        (
            AppKit.NSWindowCollectionBehaviorMoveToActiveSpace
            | AppKit.NSWindowCollectionBehaviorStationary
            | AppKit.NSWindowCollectionBehaviorFullScreenAuxiliary
        ),
        (
            AppKit.NSWindowCollectionBehaviorMoveToActiveSpace
            | AppKit.NSWindowCollectionBehaviorFullScreenAuxiliary
        ),
        (
            AppKit.NSWindowCollectionBehaviorCanJoinAllSpaces
            | AppKit.NSWindowCollectionBehaviorStationary
            | AppKit.NSWindowCollectionBehaviorFullScreenAuxiliary
        ),
    ]
    behavior_applied = False
    for behavior in behaviors:
        try:
            ns_window.setCollectionBehavior_(behavior)
            behavior_applied = True
            break
        except Exception:
            continue

    if not behavior_applied:
        return False

    shield_level = int(Quartz.CGShieldingWindowLevel()) + 1
    ns_window.setLevel_(shield_level)
    ns_window.setHidesOnDeactivate_(False)
    ns_window.makeKeyAndOrderFront_(None)
    ns_window.orderFrontRegardless()
    return True
