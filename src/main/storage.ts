import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_PROJECT_NAME = 'demo-temp';

export interface SaveInput {
  baseDir: string;
  projectName?: string;
  title: string;
  content: string;
  now?: Date;
}

export function sanitizeTitle(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/^[ .-]+|[ .-]+$/g, '');
  return cleaned;
}

export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function buildSavePath(baseDir: string, projectName: string, title: string, now: Date): string {
  const safeProject = sanitizeTitle(projectName) || DEFAULT_PROJECT_NAME;
  const safeTitle = sanitizeTitle(title) || 'untitled';

  const datePart = formatDate(now);
  const timePart = formatTime(now);

  const dayDir = path.join(baseDir, safeProject, datePart);
  ensureDir(dayDir);

  const baseName = `${timePart}_${safeTitle}`;
  const firstCandidate = path.join(dayDir, `${baseName}.md`);
  if (!fs.existsSync(firstCandidate)) {
    return firstCandidate;
  }

  let suffixCode = 'a'.charCodeAt(0);
  while (suffixCode <= 'z'.charCodeAt(0)) {
    const suffix = String.fromCharCode(suffixCode);
    const candidate = path.join(dayDir, `${baseName}-${suffix}.md`);
    if (!fs.existsSync(candidate)) {
      return candidate;
    }
    suffixCode += 1;
  }

  // Keep deterministic even after z.
  let extra = 1;
  while (true) {
    const candidate = path.join(dayDir, `${baseName}-z${extra}.md`);
    if (!fs.existsSync(candidate)) {
      return candidate;
    }
    extra += 1;
  }
}

export function saveMarkdownClip(input: SaveInput): string {
  const now = input.now ?? new Date();
  const projectName = input.projectName ?? DEFAULT_PROJECT_NAME;
  const outputPath = buildSavePath(input.baseDir, projectName, input.title, now);
  fs.writeFileSync(outputPath, input.content, { encoding: 'utf8' });
  return outputPath;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTime(date: Date): string {
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  return `${hours}-${minutes}`;
}
