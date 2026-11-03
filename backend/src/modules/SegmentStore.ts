import type { SegmentInfo } from '../types/index.js';

/**
 * A sliding window (deque) of SegmentInfo for a single rendition/profile.
 * Capped at manifestWindowSize + servingLagSegments + margin so memory
 * stays bounded for a long-running live channel.
 */
export class SegmentWindow {
  private items: SegmentInfo[] = [];

  constructor(private readonly maxItems: number = 60) {}

  push(seg: SegmentInfo): void {
    const existingIdx = this.items.findIndex((s) => s.mediaSequence === seg.mediaSequence);
    if (existingIdx >= 0) {
      const existing = this.items[existingIdx];
      existing.programDateTime = seg.programDateTime;
      existing.uri = seg.uri;
      existing.durationSec = seg.durationSec;
      existing.discontinuity = seg.discontinuity;
      existing.byteRange = seg.byteRange;
      return;
    }
    this.items.push(seg);
    this.items.sort((a, b) => a.mediaSequence - b.mediaSequence);
    this.pruneToMax();
  }

  private pruneToMax(): void {
    if (this.items.length > this.maxItems) {
      this.items.splice(0, this.items.length - this.maxItems);
    }
  }

  pruneOlderThan(cutoffSeq: number): void {
    this.items = this.items.filter((s) => s.mediaSequence >= cutoffSeq);
  }

  getAll(): SegmentInfo[] {
    return [...this.items];
  }

  getByMediaSequence(seq: number): SegmentInfo | undefined {
    return this.items.find((s) => s.mediaSequence === seq);
  }

  findByProgramDateTime(pdt: string): SegmentInfo | undefined {
    return this.items.find((s) => s.programDateTime === pdt);
  }

  /** Nearest segment to a target PDT (used for cross-profile correlation). */
  findNearestByProgramDateTime(pdtIso: string): SegmentInfo | undefined {
    const target = Date.parse(pdtIso);
    if (Number.isNaN(target)) return undefined;
    let best: SegmentInfo | undefined;
    let bestDiff = Infinity;
    for (const s of this.items) {
      if (!s.programDateTime) continue;
      const t = Date.parse(s.programDateTime);
      if (Number.isNaN(t)) continue;
      const diff = Math.abs(t - target);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = s;
      }
    }
    return best;
  }

  latest(): SegmentInfo | undefined {
    return this.items[this.items.length - 1];
  }

  /**
   * The window of segments that should be referenced in a served manifest:
   * the most recent `count` segments, held back by `lag` segments from the
   * live edge to give the transcoder time to finish ad overlay jobs.
   */
  getServableWindow(lag: number, count: number): SegmentInfo[] {
    const end = Math.max(0, this.items.length - lag);
    const start = Math.max(0, end - count);
    return this.items.slice(start, end);
  }


  getUpcomingMarkCandidates(lag: number, count: number): SegmentInfo[] {
    const live = this.items.length;
    const holdbackStart = Math.max(0, live - Math.max(0, lag));
    const start = Math.max(holdbackStart, live - Math.max(0, count));
    return this.items.slice(start, live);
  }

  size(): number {
    return this.items.length;
  }
}

/**
 * Map of profileId -> SegmentWindow. Single source of truth for live
 * segment metadata, read by the Scheduler, Transcoder, and ManifestBuilder.
 */
export class SegmentStore {
  private windows = new Map<string, SegmentWindow>();

  ensureProfile(profileId: string, maxItems = 60): SegmentWindow {
    let w = this.windows.get(profileId);
    if (!w) {
      w = new SegmentWindow(maxItems);
      this.windows.set(profileId, w);
    }
    return w;
  }

  get(profileId: string): SegmentWindow | undefined {
    return this.windows.get(profileId);
  }

  profileIds(): string[] {
    return [...this.windows.keys()];
  }

  reset(): void {
    this.windows.clear();
  }
}
