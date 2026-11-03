import PQueue from 'p-queue';
import { FfmpegOverlayJob, type FfmpegOverlayJobInput } from './FfmpegOverlayJob.js';
import type { SegmentStore } from './SegmentStore.js';

/**
 * Bounded-concurrency queue that runs one FfmpegOverlayJob per
 * (insertionId, profileId) target. On success, updates the corresponding
 * SegmentInfo.overlayStatus to READY and links the adSegmentId; on
 * failure, marks it FAILED so the ManifestBuilder falls back to serving
 * the original (non-overlaid) segment instead of blocking the stream.
 */
export class TranscodeQueue {
  private queue: PQueue;

  constructor(
    private readonly segmentStore: SegmentStore,
    concurrency = 12,
  ) {
    this.queue = new PQueue({ concurrency });
  }

  enqueue(input: FfmpegOverlayJobInput): Promise<void> {
    const window = this.segmentStore.get(input.profile.profileId);
    const segment = window?.getByMediaSequence(input.mediaSequence);
    if (segment) segment.overlayStatus = 'TRANSCODING';
    console.error(`[TranscodeQueue] enqueueing job for ${input.profile.profileId}#${input.mediaSequence}`);

    return this.queue.add(async () => {
      try {
        const job = new FfmpegOverlayJob(input);
        const record = await job.run();
        if (segment) {
          segment.overlayStatus = 'READY';
          segment.insertionId = input.insertionId;
          segment.adSegmentId = record.adSegmentId;
        }
      } catch (err) {
        if (segment) segment.overlayStatus = 'FAILED';
        // eslint-disable-next-line no-console
        console.error(
          `[TranscodeQueue] overlay failed for ${input.profile.profileId}#${input.mediaSequence}:`,
          (err as Error).message,
        );
      }
    });
  }

  size(): number {
    return this.queue.size + this.queue.pending;
  }
}
