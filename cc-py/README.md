# cc-py minimal sample

Minimal macOS verification sample for:
- global double `Cmd+C`
- fullscreen/all-space overlay behavior
- editable panel with `Cmd+S` save and `Cmd+W` close
- saving into project temp directory

## Setup (venv required)

```bash
cd /Users/saiph/Downloads/context-collector/cc-py
./setup_venv.sh
```

## Run

```bash
./run.sh
```

## Manual verification

1. Copy any text in any app, quickly press `Cmd+C` twice.
2. Confirm panel appears, clipboard text is loaded, and content is editable.
3. Confirm panel stays above normal/fullscreen app windows.
4. Press `Cmd+S`, then check files under `tmp_projects/demo-temp/YYYY-MM-DD/*.md`.
5. Press `Cmd+W` to close panel without saving.

## Quick local test (storage only)

```bash
cd /Users/saiph/Downloads/context-collector/cc-py
PYTHONPATH=src python3.13 -m unittest tests/test_storage.py
```

## Notes

- This sample requires macOS Accessibility permission for global hotkey capture.
- If hotkey listener fails, grant permission and restart.
