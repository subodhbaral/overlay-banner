import { EventEmitter } from 'node:events';
import type { MediaProfile, SegmentInfo } from '../types/index.js';
import { SegmentStore } from './SegmentStore.js';
import {
  fetchText,
  isMediaPlaylist,
  parseMasterPlaylist,
  parseVariantPlaylist,
} from '../utils/hls.js';
import { probeMediaProperties } from '../utils/ffprobe.js';

export interface ManifestPollerEvents {
  segmentsAdded: (profileId: string, segments: SegmentInfo[]) => void;
  error: (err: Error) => void;
}

/**
 * Polls an HLS origin on a fixed interval: resolves the master playlist's
 * renditions once, then re-fetches each variant playlist every tick,
 * appending newly-seen segments into the shared SegmentStore. Also runs
 * ffprobe once per profile to populate exact media properties (resolution,
 * codec, container type, bitrate) used later by the transcoder to match
 * ad-overlaid output segments to the source stream.
 */
export class ManifestPoller extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  private profiles: MediaProfile[] = [];
  private probedProfileIds = new Set<string>();
  public lastPollAt: number | null = null;
  public lastError: string | null = null;

  constructor(
    private readonly hlsInputUrl: string,
    private readonly segmentStore: SegmentStore,
    private readonly pollIntervalMs: number,
    private readonly windowCapacity: number,
  ) {
    super();
  }

  getProfiles(): MediaProfile[] {
    return this.profiles;
  }

  async start(): Promise<void> {
    await this.resolveMaster();
    await this.pollOnce();
    this.timer = setInterval(() => {
      this.pollOnce().catch((err) => this.handleError(err));
    }, this.pollIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async resolveMaster(): Promise<void> {
    const text = await fetchText(this.hlsInputUrl);
    if (isMediaPlaylist(text) && !/#EXT-X-STREAM-INF/.test(text)) {
      // Input URL is itself a single media (variant) playlist: single-profile fallback.
      this.profiles = [
        {
          profileId: 'default',
          bandwidth: 0,
          resolution: { width: 0, height: 0 },
          codecs: '',
          frameRate: 0,
          containerType: 'unknown',
          variantPlaylistUrl: this.hlsInputUrl,
          segmentDurationTarget: 0,
        },
      ];
    } else {
      const { profiles } = parseMasterPlaylist(this.hlsInputUrl, text);
      if (profiles.length === 0) {
        throw new Error('Master playlist contained no renditions');
      }
      this.profiles = profiles;
    }
    for (const p of this.profiles) {
      this.segmentStore.ensureProfile(p.profileId, this.windowCapacity);
    }
  }

  private async pollOnce(): Promise<void> {
    for (const profile of this.profiles) {
      try {
        const text = await fetchText(profile.variantPlaylistUrl);
        const parsed = parseVariantPlaylist(profile.variantPlaylistUrl, text, profile.profileId);
        profile.segmentDurationTarget = parsed.targetDuration;

        const window = this.segmentStore.ensureProfile(profile.profileId, this.windowCapacity);
        const added: SegmentInfo[] = [];
        for (const seg of parsed.segments) {
          const isNew = !window.getByMediaSequence(seg.mediaSequence);
          window.push(seg);
          if (isNew) added.push(seg);
        }

        if (!this.probedProfileIds.has(profile.profileId) && parsed.segments.length > 0) {
          this.probeProfile(profile, parsed.segments[0].uri).catch((err) => this.handleError(err));
        }

        if (added.length > 0) {
          this.emit('segmentsAdded', profile.profileId, added);
        }
      } catch (err) {
        this.handleError(err as Error);
      }
    }
    this.lastPollAt = Date.now();
  }

  private async probeProfile(profile: MediaProfile, sampleSegmentUrl: string): Promise<void> {
    this.probedProfileIds.add(profile.profileId);
    const props = await probeMediaProperties(sampleSegmentUrl);
    profile.containerType = props.containerType;
    profile.resolution = { width: props.width, height: props.height };
    // Keep the manifest-declared CODECS string (used verbatim in the master
    // manifest for player compatibility); ffprobe's codecName is only used
    // internally to confirm container/stream shape, not to overwrite it.
    profile.frameRate = props.frameRate || profile.frameRate;
    profile.videoBitrateKbps = props.videoBitrateKbps;
    profile.gopFrames = props.gopFrames;
  }

  private handleError(err: Error): void {
    this.lastError = err.message;
    this.emit('error', err);
  }
}
