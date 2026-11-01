// Mirrors backend/src/types/index.ts (kept in sync manually for this MVP;
// a shared package could be extracted later if both apps grow).

export type AdCategory = 'l-shape' | 'bottom-banner';

export interface AdCreative {
  id: string;
  name: string;
  category: AdCategory;
  imagePath: string;
  imageUrl: string;
  minWidthPct: number;
  maxWidthPct: number;
  minHeightPct: number;
  maxHeightPct: number;
  defaultWidthPct: number;
  defaultHeightPct: number;
  defaultXPct: number;
  defaultYPct: number;
}

export interface OverlayConfig {
  adId: string;
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
  insertionDurationSec: number;
  transitionDurationSec: number;
}

export type StreamStatus = 'ON' | 'OFF';

export interface StreamConfig {
  channelId: string;
  hlsInputUrl: string;
  overlay: OverlayConfig;
  pollIntervalMs: number;
  servingLagSegments: number;
  manifestWindowSize: number;
  status: StreamStatus;
}

export interface StreamStatusResponse {
  status: StreamStatus;
  channelId: string;
  lastPollAt: number | null;
  profileCount: number;
  lastError: string | null;
}

export interface AnalyticsCount {
  label: string;
  count: number;
}

export interface AnalyticsTimeline {
  bucketMs: number;
  points: { start: number; count: number }[];
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
