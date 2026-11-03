import { v4 as uuidv4 } from 'uuid';
import type { AdCreative, InsertionJob, InsertionTarget, MediaProfile, OverlayConfig } from '../types/index.js';
import { SegmentStore } from './SegmentStore.js';
import { TranscodeQueue } from './TranscodeQueue.js';
import { heartbeatService } from './HeartbeatService.js';

export interface IInsertionScheduler {
  mark(adCreative: AdCreative, overlay: OverlayConfig, durationSec: number): InsertionJob;
}

/**
 * Shared marking logic used by both the manual Insert API and (in the
 * future) an interval-driven auto-scheduler. Picks the next upcoming
 * segments on a "primary" profile (the first configured rendition) that
 * cover at least `durationSec`, then correlates the same segments on every
 * other profile by nearest EXT-X-PROGRAM-DATE-TIME (since renditions can
 * have different segment durations/sequence numbering), and enqueues one
 * FfmpegOverlayJob per (profile, segment) onto the TranscodeQueue.
 */
export class InsertionSchedulerBase implements IInsertionScheduler {
  constructor(
    private readonly segmentStore: SegmentStore,
    private readonly transcodeQueue: TranscodeQueue,
    private readonly getProfiles: () => MediaProfile[],
    private readonly getServingLagSegments: () => number,
  ) {}

  mark(adCreative: AdCreative, overlay: OverlayConfig, durationSec: number): InsertionJob {
    const insertionId = uuidv4();
    const profiles = this.getProfiles();
    if (profiles.length === 0) {
      throw new Error('No active profiles to mark; is the stream ON?');
    }

    const primary = profiles[0];
    const primaryWindow = this.segmentStore.get(primary.profileId);
    if (!primaryWindow) {
      throw new Error(`No segment window for primary profile ${primary.profileId}`);
    }

    const approxSegCount = Math.max(
      1,
      Math.ceil(durationSec / (primary.segmentDurationTarget || 6)),
    );
    const primaryCandidates = primaryWindow.getUpcomingMarkCandidates(
      this.getServingLagSegments(),
      approxSegCount,
    );
    const actualDurationSec = primaryCandidates.reduce((acc, seg) => acc + seg.durationSec, 0);
    if (primaryCandidates.length === 0) {
      throw new Error('No upcoming segments available to mark yet; try again shortly');
    }

    const targets: InsertionTarget[] = [];
    for (const primarySeg of primaryCandidates) {
      targets.push({ profileId: primary.profileId, mediaSequence: primarySeg.mediaSequence });

      for (const profile of profiles.slice(1)) {
        const window = this.segmentStore.get(profile.profileId);
        if (!window) continue;
        const match = primarySeg.programDateTime
          ? window.findNearestByProgramDateTime(primarySeg.programDateTime)
          : window.getByMediaSequence(primarySeg.mediaSequence);
        if (match) {
          targets.push({ profileId: profile.profileId, mediaSequence: match.mediaSequence });
        }
      }
    }

    const job: InsertionJob = {
      insertionId,
      adCreative,
      overlay,
      durationSec,
      actualDurationSec,
      targets,
      status: 'RUNNING',
      createdAt: Date.now(),
    };

    heartbeatService.setInsertion(insertionId, {
      adId: adCreative.id,
      category: adCreative.category,
      durationSec: actualDurationSec,
    });

    this.enqueueJobs(job, profiles, primaryCandidates.length);
    return job;
  }

  private enqueueJobs(job: InsertionJob, profiles: MediaProfile[], segmentCountPerProfile: number): void {
    const profileById = new Map(profiles.map((p) => [p.profileId, p]));
    let countForProfile: Record<string, number> = {};

    for (const target of job.targets) {
      const profile = profileById.get(target.profileId);
      if (!profile) continue;
      const window = this.segmentStore.get(target.profileId);
      const segment = window?.getByMediaSequence(target.mediaSequence);
      if (!segment) continue;

      const idx = countForProfile[target.profileId] ?? 0;
      countForProfile[target.profileId] = idx + 1;
      const isFirst = idx === 0;
      const isLast = idx === segmentCountPerProfile - 1;

      this.transcodeQueue
        .enqueue({
          insertionId: job.insertionId,
          profile,
          mediaSequence: target.mediaSequence,
          sourceSegmentUrl: segment.uri,
          segmentDurationSec: segment.durationSec,
          adCreative: job.adCreative,
          overlay: job.overlay,
          fadeIn: isFirst,
          fadeOut: isLast,
        })
        .catch(() => undefined); // failures are tracked per-segment via overlayStatus
    }
  }
}

/** Invoked synchronously by the Insert API on an operator action. */
export class ManualInsertionScheduler extends InsertionSchedulerBase {}

/**
 * Future extensibility point: drives the same `mark()` logic on a fixed
 * interval instead of a manual API call. No changes needed downstream
 * (TranscodeQueue, SegmentStore, ManifestBuilder) since both schedulers
 * produce InsertionJobs through the identical path.
 */
export class IntervalInsertionScheduler extends InsertionSchedulerBase {
  private timer: NodeJS.Timeout | null = null;

  start(intervalMs: number, pickAd: () => { adCreative: AdCreative; overlay: OverlayConfig; durationSec: number } | null): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      const next = pickAd();
      if (next) this.mark(next.adCreative, next.overlay, next.durationSec);
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
