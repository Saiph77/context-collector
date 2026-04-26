import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildSavePath, sanitizeTitle, saveMarkdownClip } from '../../src/main/storage';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-ts-storage-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('storage naming', () => {
  it('replaces invalid title chars', () => {
    expect(sanitizeTitle('a/b\\c:d*e?f"g<h>i|')).toBe('a-b-c-d-e-f-g-h-i');
  });

  it('uses untitled for empty titles', () => {
    const baseDir = makeTempDir();
    const now = new Date('2026-03-24T09:10:00');

    const output = saveMarkdownClip({
      baseDir,
      projectName: 'demo-temp',
      title: '   ',
      content: 'hello',
      now,
    });

    expect(output).toMatch(/demo-temp\/2026-03-24\/09-10_untitled\.md$/);
    expect(fs.readFileSync(output, 'utf8')).toBe('hello');
  });

  it('adds -a on filename conflict in same minute', () => {
    const baseDir = makeTempDir();
    const now = new Date('2026-03-24T10:20:00');

    const first = saveMarkdownClip({
      baseDir,
      projectName: 'demo-temp',
      title: 'same',
      content: 'one',
      now,
    });

    const second = saveMarkdownClip({
      baseDir,
      projectName: 'demo-temp',
      title: 'same',
      content: 'two',
      now,
    });

    expect(first).toMatch(/10-20_same\.md$/);
    expect(second).toMatch(/10-20_same-a\.md$/);
    expect(fs.readFileSync(second, 'utf8')).toBe('two');
  });

  it('matches target path convention', () => {
    const baseDir = makeTempDir();
    const now = new Date('2026-03-24T22:08:00');
    const built = buildSavePath(baseDir, 'demo-temp', 'spec-title', now);

    const relative = path.relative(baseDir, built).replaceAll('\\', '/');
    expect(relative).toMatch(/^demo-temp\/2026-03-24\/22-08_spec-title\.md$/);
  });
});
