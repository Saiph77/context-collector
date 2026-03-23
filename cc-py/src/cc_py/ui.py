from __future__ import annotations

from PySide6 import QtCore, QtGui, QtWidgets

from .panel_bridge import prepare_overlay_mode, promote_to_overlay
from .storage import TempProjectStorage


class CapturePanel(QtWidgets.QWidget):
    def __init__(self, storage: TempProjectStorage) -> None:
        super().__init__()
        self.storage = storage
        self._overlay_applied = False

        self.setWindowTitle("Context Collector Py Sample")
        self.resize(860, 520)
        self.setWindowFlag(QtCore.Qt.WindowType.Tool, True)
        self.setWindowFlag(QtCore.Qt.WindowType.WindowStaysOnTopHint, True)

        self.title_edit = QtWidgets.QLineEdit("untitled")
        self.editor = QtWidgets.QPlainTextEdit()
        self.project_value = QtWidgets.QLabel(self.storage.project_name)
        self.path_value = QtWidgets.QLabel("(not saved yet)")
        self.path_value.setTextInteractionFlags(QtCore.Qt.TextInteractionFlag.TextSelectableByMouse)

        save_btn = QtWidgets.QPushButton("Save (Cmd+S)")
        close_btn = QtWidgets.QPushButton("Close (Cmd+W)")
        save_btn.clicked.connect(self.save_and_close)
        close_btn.clicked.connect(self.close_panel)

        # Register both StandardKey and explicit Meta shortcuts for macOS stability.
        self._register_shortcut(QtGui.QKeySequence.StandardKey.Save, self.save_and_close)
        self._register_shortcut(QtGui.QKeySequence.StandardKey.Close, self.close_panel)
        self._register_shortcut(QtGui.QKeySequence("Meta+S"), self.save_and_close)
        self._register_shortcut(QtGui.QKeySequence("Meta+W"), self.close_panel)

        top_form = QtWidgets.QFormLayout()
        top_form.addRow("Title", self.title_edit)
        top_form.addRow("Project", self.project_value)

        button_row = QtWidgets.QHBoxLayout()
        button_row.addStretch(1)
        button_row.addWidget(close_btn)
        button_row.addWidget(save_btn)

        layout = QtWidgets.QVBoxLayout(self)
        layout.addLayout(top_form)
        layout.addWidget(QtWidgets.QLabel("Clipboard / Editable Content"))
        layout.addWidget(self.editor, 1)
        layout.addWidget(QtWidgets.QLabel("Last Saved"))
        layout.addWidget(self.path_value)
        layout.addLayout(button_row)

        # Extra fallback: capture Cmd+S / Cmd+W from focused child widgets.
        self.installEventFilter(self)
        self.title_edit.installEventFilter(self)
        self.editor.installEventFilter(self)

    def _register_shortcut(self, keyseq, handler) -> None:
        shortcut = QtGui.QShortcut(QtGui.QKeySequence(keyseq), self)
        shortcut.setContext(QtCore.Qt.ShortcutContext.ApplicationShortcut)
        shortcut.activated.connect(handler)

    def _place_near_cursor(self) -> None:
        cursor_pos = QtGui.QCursor.pos()
        screen = QtGui.QGuiApplication.screenAt(cursor_pos) or QtGui.QGuiApplication.primaryScreen()
        if screen is None:
            return

        handle = self.windowHandle()
        if handle is not None:
            handle.setScreen(screen)

        available = screen.availableGeometry()
        # Center the window on cursor position.
        target_x = cursor_pos.x() - (self.width() // 2)
        target_y = cursor_pos.y() - (self.height() // 2)

        max_x = available.right() - self.width() + 1
        max_y = available.bottom() - self.height() + 1
        x = max(available.left(), min(target_x, max_x))
        y = max(available.top(), min(target_y, max_y))
        self.move(x, y)

    def eventFilter(self, watched, event) -> bool:
        if event.type() == QtCore.QEvent.Type.KeyPress:
            key_event = event
            modifiers = key_event.modifiers()
            key = key_event.key()

            if modifiers & QtCore.Qt.KeyboardModifier.MetaModifier:
                if key == QtCore.Qt.Key.Key_S:
                    self.save_and_close()
                    return True
                if key == QtCore.Qt.Key.Key_W:
                    self.close_panel()
                    return True

        return super().eventFilter(watched, event)

    def present_text(self, text: str) -> None:
        self.editor.setPlainText(text)
        # Enter overlay activation mode before first show to avoid initial Space jump.
        prepare_overlay_mode()
        if not self.isVisible():
            self.show()
        self._place_near_cursor()

        if not self._overlay_applied:
            self._overlay_applied = promote_to_overlay(self)
        else:
            promote_to_overlay(self)

        self.raise_()
        self.activateWindow()

        # Re-apply position after native window promotion to avoid center reset.
        QtCore.QTimer.singleShot(0, self._place_near_cursor)
        QtCore.QTimer.singleShot(0, self.title_edit.setFocus)
        QtCore.QTimer.singleShot(0, self.title_edit.selectAll)

    def save_and_close(self) -> None:
        path = self.storage.save_clip(self.title_edit.text(), self.editor.toPlainText())
        self.path_value.setText(str(path))
        self.hide()

    def close_panel(self) -> None:
        self.hide()

    def closeEvent(self, event: QtGui.QCloseEvent) -> None:
        event.ignore()
        self.hide()
