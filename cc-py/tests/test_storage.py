import unittest
from pathlib import Path

from cc_py.storage import TempProjectStorage


class StorageTests(unittest.TestCase):
    def test_save_clip_creates_markdown_file(self):
        base = Path(__file__).resolve().parent / "_tmp"
        if base.exists():
            for path in sorted(base.rglob("*"), reverse=True):
                if path.is_file():
                    path.unlink()
                elif path.is_dir():
                    path.rmdir()

        storage = TempProjectStorage(base_dir=base, project_name="demo")
        saved = storage.save_clip("my title", "hello")

        self.assertTrue(saved.exists())
        self.assertEqual(saved.suffix, ".md")
        self.assertEqual(saved.read_text(encoding="utf-8"), "hello")
        self.assertIn("demo", str(saved))


if __name__ == "__main__":
    unittest.main()
