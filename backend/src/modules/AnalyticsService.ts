import fs from 'node:fs/promises';
import { ANALYTICS_LOG_FILE, SESSIONS_LOG_FILE } from '../utils/paths.js';
import { SESSION_ACTIVE_TTL_MS, type SessionCookie, type ViewerSession } from './SessionCookie.js';

export interface AnalyticsCount {
  label: string;
  count: number;
}

export interface AnalyticsPoint {
  start: number;
  count: number;
}

export interface AnalyticsTimeline {
  bucketMs: number;
  points: AnalyticsPoint[];
}

export interface SessionSummary {
  sessionId: string;
  device: string;
  profileId?: string;
  ip?: string;
  firstSeen: number;
  lastSeen: number;
}

export interface AdSummary {
  adId: string;
  category: string;
  views: number;
  durationSec: number;
}

export interface InsertionEvent {
  insertionId: string;
  sessionId: string;
  adId: string;
  category: string;
  durationSec: number;
  device: string;
  profileId: string;
  timestamp: number;
}

export interface AnalyticsReport {
  generatedAt: number;
  activeWindowMs: number;
  sessions: {
    activeCount: number;
    uniqueCount: number;
    byDevice: AnalyticsCount[];
    timeline: AnalyticsTimeline;
    active: SessionSummary[];
  };
  insertions: {
    viewCount: number;
    uniqueCount: number;
    totalDurationSec: number;
    byAd: AdSummary[];
    byCategory: AnalyticsCount[];
    timeline: AnalyticsTimeline;
    recent: InsertionEvent[];
  };
}

interface SessionLine {
  sessionId?: string;
  firstSeen?: number;
  lastSeen?: number;
  ip?: string;
  device?: string;
  profileId?: string;
}

interface HeartbeatLine {
  insertionId?: string;
  sessionId?: string;
  profileId?: string;
  adId?: string;
  category?: string;
  durationSec?: number;
  device?: string;
  timestamp?: number;
}

const RECENT_LIMIT = 20;

export async function buildAnalyticsReport(sessions: SessionCookie): Promise<AnalyticsReport> {
  const now = Date.now();
  const [sessionLines, heartbeatLines] = await Promise.all([
    readJsonl<SessionLine>(SESSIONS_LOG_FILE),
    readJsonl<HeartbeatLine>(ANALYTICS_LOG_FILE),
  ]);

  const rolled = rollupSessions(sessionLines);
  const live = sessions.listActive(now);
  for (const session of live) mergeLive(rolled, session);

  const activeIds = new Set(live.map((session) => session.sessionId));
  for (const [id, session] of rolled) {
    if (now - session.lastSeen <= SESSION_ACTIVE_TTL_MS) activeIds.add(id);
  }

  const active = [...activeIds]
    .map((id) => rolled.get(id))
    .filter((session): session is SessionSummary => session !== undefined)
    .sort((a, b) => b.lastSeen - a.lastSeen);

  const hearts = heartbeatLines.filter(
    (line): line is Required<Pick<HeartbeatLine, 'insertionId' | 'sessionId' | 'timestamp'>> & HeartbeatLine =>
      Boolean(line.insertionId && line.sessionId && line.timestamp),
  );

  const byAd = new Map<string, AdSummary>();
  const byCategory = new Map<string, number>();
  const insertionIds = new Set<string>();
  let totalDurationSec = 0;

  for (const line of hearts) {
    const adId = line.adId || 'unknown';
    const category = line.category || 'unknown';
    const durationSec = line.durationSec ?? 0;
    insertionIds.add(line.insertionId!);
    totalDurationSec += durationSec;

    const ad = byAd.get(adId) ?? { adId, category, views: 0, durationSec: 0 };
    ad.views += 1;
    ad.durationSec += durationSec;
    ad.category = category;
    byAd.set(adId, ad);
    byCategory.set(category, (byCategory.get(category) ?? 0) + 1);
  }

  const recent = [...hearts]
    .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
    .slice(0, RECENT_LIMIT)
    .map((line) => ({
      insertionId: line.insertionId!,
      sessionId: line.sessionId!,
      adId: line.adId || 'unknown',
      category: line.category || 'unknown',
      durationSec: line.durationSec ?? 0,
      device: deviceLabel(line.device),
      profileId: line.profileId || 'unknown',
      timestamp: line.timestamp!,
    }));

  const sessionList = [...rolled.values()];

  return {
    generatedAt: now,
    activeWindowMs: SESSION_ACTIVE_TTL_MS,
    sessions: {
      activeCount: active.length,
      uniqueCount: rolled.size,
      byDevice: counts(sessionList.map((session) => session.device)),
      timeline: timeline(sessionList.map((session) => session.firstSeen)),
      active,
    },
    insertions: {
      viewCount: hearts.length,
      uniqueCount: insertionIds.size,
      totalDurationSec: round1(totalDurationSec),
      byAd: [...byAd.values()]
        .map((ad) => ({ ...ad, durationSec: round1(ad.durationSec) }))
        .sort((a, b) => b.views - a.views),
      byCategory: counts([...byCategory.entries()].map(([label, count]) => ({ label, count }))),
      timeline: timeline(hearts.map((line) => line.timestamp!)),
      recent,
    },
  };
}

function mergeLive(rolled: Map<string, SessionSummary>, session: ViewerSession): void {
  const prev = rolled.get(session.sessionId);
  rolled.set(session.sessionId, {
    sessionId: session.sessionId,
    device: deviceLabel(session.device ?? prev?.device),
    profileId: session.profileId ?? prev?.profileId,
    ip: session.ip ?? prev?.ip,
    firstSeen: prev ? Math.min(prev.firstSeen, session.firstSeen) : session.firstSeen,
    lastSeen: Math.max(prev?.lastSeen ?? 0, session.lastSeen),
  });
}

function rollupSessions(lines: SessionLine[]): Map<string, SessionSummary> {
  const rolled = new Map<string, SessionSummary>();
  for (const line of lines) {
    if (!line.sessionId || line.firstSeen == null || line.lastSeen == null) continue;
    const prev = rolled.get(line.sessionId);
    if (!prev || line.lastSeen >= prev.lastSeen) {
      rolled.set(line.sessionId, {
        sessionId: line.sessionId,
        device: deviceLabel(line.device ?? prev?.device),
        profileId: line.profileId ?? prev?.profileId,
        ip: line.ip ?? prev?.ip,
        firstSeen: prev ? Math.min(prev.firstSeen, line.firstSeen) : line.firstSeen,
        lastSeen: line.lastSeen,
      });
    } else {
      prev.firstSeen = Math.min(prev.firstSeen, line.firstSeen);
    }
  }
  return rolled;
}

function counts(labels: Array<string | { label: string; count: number }>): AnalyticsCount[] {
  const map = new Map<string, number>();
  for (const item of labels) {
    if (typeof item === 'string') {
      map.set(item, (map.get(item) ?? 0) + 1);
    } else {
      map.set(item.label, (map.get(item.label) ?? 0) + item.count);
    }
  }
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

function timeline(times: number[]): AnalyticsTimeline {
  if (times.length === 0) return { bucketMs: 0, points: [] };
  const min = Math.min(...times);
  const max = Math.max(...times);
  const bucketMs = bucketSize(max - min);
  const start = Math.floor(min / bucketMs) * bucketMs;
  const end = Math.floor(max / bucketMs) * bucketMs;
  const buckets = new Map<number, number>();
  for (let t = start; t <= end; t += bucketMs) buckets.set(t, 0);
  for (const ts of times) {
    const bucket = Math.floor(ts / bucketMs) * bucketMs;
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  }
  return {
    bucketMs,
    points: [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([pointStart, count]) => ({ start: pointStart, count })),
  };
}

function bucketSize(spanMs: number): number {
  const span = Math.max(spanMs, 60_000);
  const sizes = [5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000, 24 * 60 * 60_000];
  for (const size of sizes) {
    if (span / size <= 24) return size;
  }
  return 24 * 60 * 60_000;
}

function deviceLabel(raw?: string): string {
  if (!raw) return 'Unknown';
  const trimmed = raw.trim().replace(/^"|"$/g, '');
  return trimmed || 'Unknown';
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

async function readJsonl<T>(file: string): Promise<T[]> {
  let text: string;
  try {
    text = await fs.readFile(file, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const rows: T[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push(JSON.parse(trimmed) as T);
    } catch {
      // A concurrent append can leave a partial last line.
    }
  }
  return rows;
}
