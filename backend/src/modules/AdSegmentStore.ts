import fs from 'node:fs/promises';
import path from 'node:path';
import type { AdSegmentRecord } from '../types/index.js';
import { AD_SEGMENTS_DIR } from '../utils/paths.js';

/**
 * In-memory registry of transcoded ad segments, backed by files on disk
 * under data/ad-segments/{insertionId}/{profileId}/. A periodic sweep
 * deletes files (and records) older than the retention window so disk
 * usage stays bounded for a long-running live channel.
 */
export class AdSegmentStore {
  private records = new Map<string, AdSegmentRecord>();
  private sweepTimer: NodeJS.Timeout | null = null;

  key(profileId: string, mediaSequence: number): string {
    return `${profileId}:${mediaSequence}`;
  }

  register(record: AdSegmentRecord): void {
    this.records.set(this.key(record.profileId, record.mediaSequence), record);
  }

  get(profileId: string, mediaSequence: number): AdSegmentRecord | undefined {
    return this.records.get(this.key(profileId, mediaSequence));
  }

  getById(adSegmentId: string): AdSegmentRecord | undefined {
    for (const r of this.records.values()) {
      if (r.adSegmentId === adSegmentId) return r;
    }
    return undefined;
  }

  outputDirFor(insertionId: string, profileId: string): string {
    return path.join(AD_SEGMENTS_DIR, insertionId, profileId);
  }

  async ensureOutputDir(insertionId: string, profileId: string): Promise<string> {
    const dir = this.outputDirFor(insertionId, profileId);
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }

  /** Starts a periodic sweep that removes ad segment files/records older than retentionMs. */
  startSweeper(retentionMs: number, intervalMs = 60_000): void {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => {
      this.sweep(retentionMs).catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[AdSegmentStore] sweep failed', err);
      });
    }, intervalMs);
  }

  stopSweeper(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  async sweep(retentionMs: number): Promise<void> {
    const cutoff = Date.now() - retentionMs;
    const staleInsertionDirs = new Set<string>();

    for (const [key, record] of this.records) {
      if (record.createdAt < cutoff) {
        await fs.rm(record.filePath, { force: true }).catch(() => undefined);
        this.records.delete(key);
        staleInsertionDirs.add(path.dirname(path.dirname(record.filePath)));
      }
    }

    for (const dir of staleInsertionDirs) {
      const remaining = [...this.records.values()].some((r) => r.filePath.startsWith(dir));
      if (!remaining) {
        await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
      }
    }
  }
}

export const adSegmentStore = new AdSegmentStore();
