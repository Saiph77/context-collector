from __future__ import annotations

import fcntl
import os
import signal
import sys
import tempfile
import time

from PySide6 import QtCore, QtWidgets

from .clipboard import read_clipboard_text
from .hotkey import DoubleCmdCListener
from .storage import TempProjectStorage
from .ui import CapturePanel


def _acquire_single_instance_lock():
    lock_path = f"{tempfile.gettempdir()}/context_collector_py_sample.lock"
    lock_file = open(lock_path, "w", encoding="utf-8")
    try:
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        lock_file.close()
        return None
    lock_file.write(str(os.getpid()))
    lock_file.flush()
    return lock_file


def main() -> int:
    if sys.platform != "darwin":
        print("This sample only supports macOS.")
        return 1

    lock_file = _acquire_single_instance_lock()
    if lock_file is None:
        print("Another cc-py sample instance is already running.")
        return 1

    app = QtWidgets.QApplication(sys.argv)
    app.setApplicationName("Context Collector Py Sample")
    app.setQuitOnLastWindowClosed(False)

    # Make Ctrl+C / SIGTERM reliable while Qt event loop is running.
    signal.signal(signal.SIGINT, lambda *_: QtCore.QTimer.singleShot(0, app.quit))
    signal.signal(signal.SIGTERM, lambda *_: QtCore.QTimer.singleShot(0, app.quit))
    signal_pump = QtCore.QTimer()
    signal_pump.timeout.connect(lambda: None)
    signal_pump.start(200)

    storage = TempProjectStorage()
    panel = CapturePanel(storage)
    last_trigger_time = 0.0

    def _recreate_hidden_panel_if_needed() -> None:
        nonlocal panel
        if panel.isVisible():
            return
        panel.close()
        panel.deleteLater()
        panel = CapturePanel(storage)

    def open_panel_from_clipboard() -> None:
        nonlocal last_trigger_time
        now = time.monotonic()
        if now - last_trigger_time < 0.35:
            return
        last_trigger_time = now
        _recreate_hidden_panel_if_needed()
        panel.present_text(read_clipboard_text())

    def save_visible_panel() -> None:
        if panel.isVisible():
            panel.save_and_close()

    def close_visible_panel() -> None:
        if panel.isVisible():
            panel.close_panel()

    listener = DoubleCmdCListener(
        on_trigger=lambda: QtCore.QTimer.singleShot(0, open_panel_from_clipboard),
        on_cmd_s=lambda: QtCore.QTimer.singleShot(0, save_visible_panel),
        on_cmd_w=lambda: QtCore.QTimer.singleShot(0, close_visible_panel),
        shortcut_enabled=lambda: panel.isVisible(),
    )

    if not listener.start():
        QtWidgets.QMessageBox.critical(
            None,
            "Hotkey Listener Failed",
            "Cannot start CGEventTap. Please grant Accessibility permission and restart.",
        )

    app.aboutToQuit.connect(listener.stop)

    print("Context Collector Py sample started.")
    print("- Double Cmd+C to open panel")
    print("- Cmd+S to save into cc-py/tmp_projects/demo-temp")
    print("- Cmd+W to close panel")

    try:
        return app.exec()
    finally:
        lock_file.close()


if __name__ == "__main__":
    raise SystemExit(main())
