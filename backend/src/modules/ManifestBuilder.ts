import type { MediaProfile, SegmentInfo, StreamConfig } from '../types/index.js';
import { SegmentStore } from './SegmentStore.js';
import { AdSegmentStore } from './AdSegmentStore.js';

/**
 * Builds the master and per-rendition manifests served to players.
 *
 * - Master manifest: rewrites each variant's URI to point back at this
 *   server's own /manifest/:profileId.m3u8 (so variant requests always
 *   flow through the Stitcher), otherwise passes rendition metadata
 *   through unchanged.
 * - Variant manifest: reads the "servable window" (live edge held back by
 *   `servingLagSegments`) from the SegmentStore. Any segment whose
 *   overlayStatus is READY is substituted with its ad-segment URL; segments
 *   that are MARKED/TRANSCODING/FAILED/NONE are served as the original
 *   source URI (graceful fallback to source if the overlay isn't ready).
 */
export class ManifestBuilder {
  constructor(
    private readonly segmentStore: SegmentStore,
    private readonly adSegmentStore: AdSegmentStore,
  ) {}

  buildMasterManifest(profiles: MediaProfile[], selfBaseUrl: string): string {
    const lines: string[] = ['#EXTM3U', '#EXT-X-VERSION:3'];
    for (const p of profiles) {
      const attrs = [`BANDWIDTH=${p.bandwidth || 1}`];
      if (p.resolution.width && p.resolution.height) {
        attrs.push(`RESOLUTION=${p.resolution.width}x${p.resolution.height}`);
      }
      if (p.codecs) attrs.push(`CODECS="${p.codecs}"`);
      lines.push(`#EXT-X-STREAM-INF:${attrs.join(',')}`);
      lines.push(`${selfBaseUrl}/manifest/${encodeURIComponent(p.profileId)}.m3u8`);
    }
    return lines.join('\n') + '\n';
  }

  buildVariantManifest(profileId: string, config: StreamConfig, selfBaseUrl: string): string {
    const window = this.segmentStore.get(profileId);
    if (!window) {
      throw new Error(`Unknown profile ${profileId}`);
    }

    const segments = window.getServableWindow(config.servingLagSegments, config.manifestWindowSize);
    if (segments.length === 0) {
      // Not enough data buffered yet; return an empty-but-valid live manifest.
      return ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-TARGETDURATION:6', '#EXT-X-MEDIA-SEQUENCE:0'].join(
        '\n',
      ) + '\n';
    }

    const targetDuration = Math.ceil(Math.max(...segments.map((s) => s.durationSec), 1));
    const lines: string[] = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      `#EXT-X-TARGETDURATION:${targetDuration}`,
      `#EXT-X-MEDIA-SEQUENCE:${segments[0].mediaSequence}`,
    ];
    let lastInsertionIdEmitted: string | null = null;

    for (const seg of segments) {
      if (seg.discontinuity) lines.push('#EXT-X-DISCONTINUITY');
      if (seg.programDateTime) lines.push(`#EXT-X-PROGRAM-DATE-TIME:${seg.programDateTime}`);

      const isAd = seg.overlayStatus === 'READY' && seg.adSegmentId && seg.insertionId;
      if (isAd && seg.insertionId !== lastInsertionIdEmitted) {
        // One EXT-X-DATERANGE per insertion event (not per segment) so a
        // player/analytics layer can attribute the whole ad break to a
        // single insertionId even though it spans multiple segments.
        const startDate: string = seg.programDateTime ?? new Date().toISOString();
        lines.push(
          `#EXT-X-DATERANGE:ID="${seg.insertionId}",START-DATE="${startDate}",CLASS="com.overlay.ad-insertion"`,
        );
        lines.push('#EXT-X-DISCONTINUITY');
        lastInsertionIdEmitted = seg.insertionId ?? null;
      } else if (!isAd) {
        lastInsertionIdEmitted = null;
      }

      lines.push(`#EXTINF:${seg.durationSec.toFixed(3)},`);
      lines.push(this.resolveSegmentUrl(seg, selfBaseUrl));
      // Each overlaid segment is its own encode, so the timestamp jumps at
      // every boundary, including between two ads and back to the source.
      if (isAd) lines.push('#EXT-X-DISCONTINUITY');
    }

    return lines.join('\n') + '\n';
  }

  private resolveSegmentUrl(seg: SegmentInfo, selfBaseUrl: string): string {
    if (seg.overlayStatus === 'READY' && seg.adSegmentId) {
      const record = this.adSegmentStore.getById(seg.adSegmentId);
      if (record) {
        return `${selfBaseUrl}/segments/ad/${record.insertionId}/${record.profileId}/${record.fileName}`;
      }
    }
    // Fallback: original/source segment, served directly from the HLS origin.
    return seg.uri;
  }
}
