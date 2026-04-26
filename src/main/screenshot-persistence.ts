import fs from 'node:fs';
import path from 'node:path';

import type { VisionAttachment } from './vision-api';

export interface VisionSessionInteraction {
  id: string;
  type: 'chat' | 'transcript';
  prompt: string;
  status: 'pending' | 'success' | 'error';
  startedAt: string;
  finishedAt?: string;
  response?: string;
  error?: string;
}

export interface VisionSessionPayload {
  id: string;
  createdAt: string;
  updatedAt: string;
  attachments: VisionAttachment[];
  interactions: VisionSessionInteraction[];
}

export interface VisionHistoryAttachmentMeta {
  id: string;
  name: string;
  kind: 'image' | 'file';
  source: 'screenshot' | 'upload';
  mimeType: string;
  width?: number;
  height?: number;
}

export interface VisionHistorySnapshot {
  id: string;
  createdAt: string;
  updatedAt: string;
  attachments: VisionHistoryAttachmentMeta[];
  interactions: VisionSessionInteraction[];
  sessionPath: string;
}

export interface VisionHistorySummary {
  id: string;
  createdAt: string;
  updatedAt: string;
  interactionCount: number;
  attachmentCount: number;
  lastPrompt: string;
  lastStatus: 'pending' | 'success' | 'error' | 'none';
}

interface VisionHistoryJsonlLine {
  type: 'session_snapshot';
  writtenAt: string;
  session: VisionHistorySnapshot;
}

export class ScreenshotPersistence {
  private sessionPath = '';
  private session: VisionSessionPayload | null = null;

  private readonly historyPath: string;

  constructor(private readonly rootDir: string) {
    this.historyPath = path.join(rootDir, 'vision-history.jsonl');
  }

  hasSession(): boolean {
    return this.session !== null;
  }

  getCurrentSessionId(): string | null {
    return this.session?.id ?? null;
  }

  startNewSession(): VisionSessionPayload {
    const createdAt = new Date().toISOString();
    const id = `vision-${createdAt.replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 8)}`;

    fs.mkdirSync(this.rootDir, { recursive: true });

    this.sessionPath = path.join(this.rootDir, `${id}.json`);
    this.session = {
      id,
      createdAt,
      updatedAt: createdAt,
      attachments: [],
      interactions: [],
    };

    this.writeSnapshot();
    return this.session;
  }

  upsertAttachments(attachments: VisionAttachment[]): void {
    this.ensureSession();
    if (!this.session) {
      return;
    }

    this.session.attachments = attachments;
    this.touch();
    this.writeSnapshot();
  }

  startInteraction(type: 'chat' | 'transcript', prompt: string): string {
    this.ensureSession();
    if (!this.session) {
      throw new Error('Cannot create vision session payload');
    }

    const interactionId = `interaction-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.session.interactions.push({
      id: interactionId,
      type,
      prompt,
      status: 'pending',
      startedAt: new Date().toISOString(),
    });
    this.touch();
    this.writeSnapshot();
    return interactionId;
  }

  finishInteractionSuccess(interactionId: string, response: string): void {
    if (!this.session) {
      return;
    }

    const interaction = this.session.interactions.find((item) => item.id === interactionId);
    if (!interaction) {
      return;
    }

    interaction.status = 'success';
    interaction.finishedAt = new Date().toISOString();
    interaction.response = response;
    interaction.error = undefined;
    this.touch();
    this.writeSnapshot();
  }

  finishInteractionError(interactionId: string, error: string): void {
    if (!this.session) {
      return;
    }

    const interaction = this.session.interactions.find((item) => item.id === interactionId);
    if (!interaction) {
      return;
    }

    interaction.status = 'error';
    interaction.finishedAt = new Date().toISOString();
    interaction.error = error;
    this.touch();
    this.writeSnapshot();
  }

  getSessionPath(): string {
    this.ensureSession();
    return this.sessionPath;
  }

  listHistorySummaries(limit = 30): VisionHistorySummary[] {
    const snapshots = this.readLatestSnapshots();

    const summaries = snapshots
      .map((snapshot) => toSummary(snapshot))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

    return summaries.slice(0, Math.max(1, limit));
  }

  loadHistorySession(sessionId: string): VisionHistorySnapshot | null {
    if (!sessionId.trim()) {
      return null;
    }

    const snapshots = this.readLatestSnapshots();
    return snapshots.find((snapshot) => snapshot.id === sessionId) ?? null;
  }

  private ensureSession(): void {
    if (this.session) {
      return;
    }

    this.startNewSession();
  }

  private touch(): void {
    if (this.session) {
      this.session.updatedAt = new Date().toISOString();
    }
  }

  private writeSnapshot(): void {
    if (!this.session || !this.sessionPath) {
      return;
    }

    fs.mkdirSync(this.rootDir, { recursive: true });

    fs.writeFileSync(this.sessionPath, JSON.stringify(this.session, null, 2), {
      encoding: 'utf8',
    });

    const historyLine: VisionHistoryJsonlLine = {
      type: 'session_snapshot',
      writtenAt: new Date().toISOString(),
      session: {
        id: this.session.id,
        createdAt: this.session.createdAt,
        updatedAt: this.session.updatedAt,
        attachments: this.session.attachments.map((item) => ({
          id: item.id,
          name: item.name,
          kind: item.kind,
          source: item.source,
          mimeType: item.mimeType,
          width: item.width,
          height: item.height,
        })),
        interactions: this.session.interactions,
        sessionPath: this.sessionPath,
      },
    };

    fs.appendFileSync(this.historyPath, `${JSON.stringify(historyLine)}\n`, {
      encoding: 'utf8',
    });
  }

  private readLatestSnapshots(): VisionHistorySnapshot[] {
    if (!fs.existsSync(this.historyPath)) {
      return [];
    }

    const content = fs.readFileSync(this.historyPath, { encoding: 'utf8' });
    if (!content.trim()) {
      return [];
    }

    const latest = new Map<string, VisionHistorySnapshot>();
    const lines = content.split('\n').filter((line) => line.trim().length > 0);

    for (const line of lines) {
      let parsed: VisionHistoryJsonlLine;
      try {
        parsed = JSON.parse(line) as VisionHistoryJsonlLine;
      } catch {
        continue;
      }

      if (parsed.type !== 'session_snapshot' || !parsed.session?.id) {
        continue;
      }

      const current = latest.get(parsed.session.id);
      if (!current || parsed.session.updatedAt >= current.updatedAt) {
        latest.set(parsed.session.id, parsed.session);
      }
    }

    return Array.from(latest.values());
  }
}

function toSummary(snapshot: VisionHistorySnapshot): VisionHistorySummary {
  const interactions = snapshot.interactions;
  const lastInteraction = interactions[interactions.length - 1];

  return {
    id: snapshot.id,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
    interactionCount: interactions.length,
    attachmentCount: snapshot.attachments.length,
    lastPrompt: lastInteraction?.prompt ?? '',
    lastStatus: lastInteraction?.status ?? 'none',
  };
}
