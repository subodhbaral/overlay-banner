import { Parser } from 'm3u8-parser';
import fetch from 'node-fetch';
import type { MediaProfile, Resolution, SegmentInfo } from '../types/index.js';

export interface ParsedMasterPlaylist {
  profiles: MediaProfile[];
}

export interface ParsedVariantPlaylist {
  targetDuration: number;
  mediaSequence: number;
  segments: SegmentInfo[];
}

/** Resolve a (possibly relative) URI found inside a playlist against its own URL. */
export function resolveUrl(baseUrl: string, uri: string): string {
  return new URL(uri, baseUrl).toString();
}

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': 'hls-ad-overlay/0.1' } });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  }
  return res.text();
}

function parseResolution(attr: unknown): Resolution {
  const r = attr as { width?: number; height?: number } | undefined;
  return { width: r?.width ?? 0, height: r?.height ?? 0 };
}

/**
 * Parses a master playlist into MediaProfile[]. If the playlist has no
 * nested `playlists` (i.e. it is itself a media/variant playlist), the
 * caller should treat the given URL as the single profile directly.
 */
export function parseMasterPlaylist(masterUrl: string, text: string): ParsedMasterPlaylist {
  const parser = new Parser();
  parser.push(text);
  parser.end();
  const manifest = parser.manifest as any;

  const profiles: MediaProfile[] = (manifest.playlists ?? []).map(
    (pl: any, idx: number): MediaProfile => {
      const attrs = pl.attributes ?? {};
      const variantUrl = resolveUrl(masterUrl, pl.uri);
      return {
        profileId: attrs['NAME'] ?? `profile-${idx}-${attrs['BANDWIDTH'] ?? idx}`,
        bandwidth: attrs['BANDWIDTH'] ?? 0,
        resolution: parseResolution(attrs['RESOLUTION']),
        codecs: attrs['CODECS'] ?? '',
        frameRate: attrs['FRAME-RATE'] ?? 0,
        containerType: 'unknown',
        variantPlaylistUrl: variantUrl,
        segmentDurationTarget: 0,
      };
    },
  );

  return { profiles };
}

/** True if a parsed manifest is a media (variant) playlist rather than a master. */
export function isMediaPlaylist(text: string): boolean {
  return /#EXT-X-TARGETDURATION/.test(text) || /#EXTINF/.test(text);
}

export function parseVariantPlaylist(
  variantUrl: string,
  text: string,
  profileId: string,
): ParsedVariantPlaylist {
  const parser = new Parser();
  parser.push(text);
  parser.end();
  const manifest = parser.manifest as any;

  const mediaSequenceStart: number = manifest.mediaSequence ?? 0;
  let runningPdt: number | null = null;

  const segments: SegmentInfo[] = (manifest.segments ?? []).map((seg: any, idx: number) => {
    let pdtIso: string | null = null;
    if (seg.dateTimeObject instanceof Date) {
      pdtIso = seg.dateTimeObject.toISOString();
      runningPdt = seg.dateTimeObject.getTime();
    } else if (runningPdt !== null) {
      // Derive PDT by accumulating durations when source omits EXT-X-PROGRAM-DATE-TIME
      // on every segment (common: only present after discontinuities).
      pdtIso = new Date(runningPdt).toISOString();
      runningPdt += Math.round((seg.duration ?? 0) * 1000);
    }

    const info: SegmentInfo = {
      profileId,
      mediaSequence: mediaSequenceStart + idx,
      programDateTime: pdtIso,
      uri: resolveUrl(variantUrl, seg.uri),
      durationSec: seg.duration ?? 0,
      discontinuity: Boolean(seg.discontinuity),
      overlayStatus: 'NONE',
    };
    if (seg.byterange) {
      info.byteRange = { length: seg.byterange.length, offset: seg.byterange.offset };
    }
    return info;
  });

  return {
    targetDuration: manifest.targetDuration ?? 6,
    mediaSequence: mediaSequenceStart,
    segments,
  };
}
