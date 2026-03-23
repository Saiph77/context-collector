from AppKit import NSPasteboard, NSPasteboardTypeString


def read_clipboard_text() -> str:
    pasteboard = NSPasteboard.generalPasteboard()
    text = pasteboard.stringForType_(NSPasteboardTypeString)
    return text or ""
