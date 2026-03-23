from __future__ import annotations

from datetime import datetime
from pathlib import Path

from .config import DEFAULT_PROJECT_NAME, TMP_PROJECTS_DIR


class TempProjectStorage:
    def __init__(self, base_dir: Path | None = None, project_name: str = DEFAULT_PROJECT_NAME) -> None:
        self.base_dir = Path(base_dir or TMP_PROJECTS_DIR)
        self.project_name = self._sanitize_title(project_name)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    @property
    def project_dir(self) -> Path:
        path = self.base_dir / self.project_name
        path.mkdir(parents=True, exist_ok=True)
        return path

    def save_clip(self, title: str, content: str) -> Path:
        now = datetime.now()
        day_dir = self.project_dir / now.strftime("%Y-%m-%d")
        day_dir.mkdir(parents=True, exist_ok=True)

        safe_title = self._sanitize_title(title) or "untitled"
        filename = f"{now.strftime('%H-%M')}_{safe_title}.md"
        path = day_dir / filename
        if path.exists():
            suffix = ord("a")
            while True:
                candidate = day_dir / f"{now.strftime('%H-%M')}_{safe_title}-{chr(suffix)}.md"
                if not candidate.exists():
                    path = candidate
                    break
                suffix += 1

        path.write_text(content, encoding="utf-8")
        return path

    @staticmethod
    def _sanitize_title(value: str) -> str:
        cleaned = "".join(ch if ch not in '\\/:*?\"<>|' else "-" for ch in value.strip())
        return cleaned.strip(" .-")
