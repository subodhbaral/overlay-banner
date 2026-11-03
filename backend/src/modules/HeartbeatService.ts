import fs from 'node:fs/promises';
import type { HeartbeatEvent, AdCategory } from '../types/index.js';
import { ANALYTICS_DIR, ANALYTICS_LOG_FILE } from '../utils/paths.js';

const DEDUP_TTL_MS = 30_000;
const INSERTION_TTL_MS = 30 * 60 * 1000;

type InsertionMeta = {
  adId: string;
  category: AdCategory;
  durationSec: number;
  notedAt: number;
};

/**
 * Records analytics events for ad-segment delivery. Callers pass the
 * session id taken from SessionCookie; this service does not mint one.
 * Dedup prevents a single logical ad view from being double-counted when a
 * player's ABR engine fetches the overlapping ad segment on more than one
 * rendition around a quality switch.
 */
export class HeartbeatService {
  private recentlySeen = new Map<string, number>();
  private insertions = new Map<string, InsertionMeta>();

  setInsertion(insertionId: string, meta: { adId: string; category: AdCategory; durationSec: number }) {
    this.insertions.set(insertionId, { ...meta, notedAt: Date.now() });
  }

  async record(event: HeartbeatEvent): Promise<{ recorded: boolean }> {
    const key = `${event.insertionId}:${event.sessionId}`;
    const now = Date.now();
    this.pruneExpired(now);

    if (this.recentlySeen.has(key)) {
      return { recorded: false };
    }
    this.recentlySeen.set(key, now);

    const meta = this.insertions.get(event.insertionId);
    const line: HeartbeatEvent = meta
      ? { ...event, adId: meta.adId, category: meta.category, durationSec: meta.durationSec }
      : event;

    await fs.mkdir(ANALYTICS_DIR, { recursive: true });
    await fs.appendFile(ANALYTICS_LOG_FILE, JSON.stringify(line) + '\n', 'utf-8');
    return { recorded: true };
  }

  private pruneExpired(now: number): void {
    for (const [key, seenAt] of this.recentlySeen) {
      if (now - seenAt > DEDUP_TTL_MS) this.recentlySeen.delete(key);
    }
    for (const [id, meta] of this.insertions) {
      if (now - meta.notedAt > INSERTION_TTL_MS) this.insertions.delete(id);
    }
  }
}

export const heartbeatService = new HeartbeatService();
