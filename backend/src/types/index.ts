// Core domain types shared across backend modules.
// Mirrors the data structures defined in PLAN.md section 3.

export type OverlayStatus = 'NONE' | 'MARKED' | 'TRANSCODING' | 'READY' | 'FAILED';

export type AdCategory = 'l-shape' | 'bottom-banner';

export interface AdCreative {
  id: string;
  name: string;
  category: AdCategory;
  imagePath: string; // relative path served under /ads-catalog/images/*
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
  xPct: number; // top-left, relative to video frame (0-100)
  yPct: number;
  widthPct: number;
  heightPct: number;
  insertionDurationSec: number;
  transitionDurationSec: number;
}

export type StreamStatus = 'ON' | 'OFF';

export interface StreamConfig {
  channelId: string; // fixed single value for MVP: "default"
  hlsInputUrl: string;
  overlay: OverlayConfig;
  pollIntervalMs: number;
  servingLagSegments: number;
  manifestWindowSize: number;
  status: StreamStatus;
}

export interface Resolution {
  width: number;
  height: number;
}

export interface MediaProfile {
  profileId: string;
  bandwidth: number;
  resolution: Resolution;
  codecs: string;
  frameRate: number;
  containerType: 'ts' | 'fmp4' | 'unknown';
  variantPlaylistUrl: string; // absolute resolved URL on origin
  segmentDurationTarget: number;
  videoBitrateKbps?: number;
  gopFrames?: number;
}

export interface SegmentInfo {
  profileId: string;
  mediaSequence: number;
  programDateTime: string | null; // ISO string, used for cross-profile correlation
  uri: string; // absolute resolved URL on origin
  durationSec: number;
  discontinuity: boolean;
  overlayStatus: OverlayStatus;
  insertionId?: string;
  adSegmentId?: string;
  byteRange?: { length: number; offset?: number };
  downloadedPath?: string; // local cache path once fetched for transcoding
}

export interface InsertionTarget {
  profileId: string;
  mediaSequence: number;
}

export type InsertionJobStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'PARTIAL_FAILURE' | 'FAILED';

export interface InsertionJob {
  insertionId: string;
  adCreative: AdCreative;
  overlay: OverlayConfig;
  durationSec: number;
  actualDurationSec: number;
  targets: InsertionTarget[];
  status: InsertionJobStatus;
  createdAt: number;
}

export interface AdSegmentRecord {
  adSegmentId: string;
  insertionId: string;
  profileId: string;
  mediaSequence: number;
  filePath: string;
  fileName: string;
  createdAt: number;
}

export interface HeartbeatEvent {
  insertionId: string;
  sessionId: string;
  profileId: string;
  /** Catalog id, e.g. "l-shape-cupra". Filled from the insertion noted at mark time. */
  adId?: string;
  category?: AdCategory;
  /** Covered media time for the insertion, in seconds. */
  durationSec?: number;
  device?: string;
  userAgent?: string;
  ip?: string;
  timestamp: number;
}

export interface StreamStatusResponse {
  status: StreamStatus;
  channelId: string;
  lastPollAt: number | null;
  profileCount: number;
  lastError: string | null;
}
