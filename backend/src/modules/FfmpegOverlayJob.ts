import { spawn } from 'node:child_process';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import type { AdCreative, AdSegmentRecord, MediaProfile, OverlayConfig } from '../types/index.js';
import { adSegmentStore } from './AdSegmentStore.js';
import { ADS_IMAGES_DIR } from '../utils/paths.js';

export interface FfmpegOverlayJobInput {
  insertionId: string;
  profile: MediaProfile;
  mediaSequence: number;
  sourceSegmentUrl: string;
  segmentDurationSec: number;
  adCreative: AdCreative;
  overlay: OverlayConfig;
  /** true for the first/last marked segment of the insertion, to apply the configured fade transition */
  fadeIn: boolean;
  fadeOut: boolean;
}

function pct(value: number, total: number): number {
  return Math.max(0, Math.round((value / 100) * total));
}

function num(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}


function growExpr(fadeIn: boolean, fadeOut: boolean, dur: number, seg: number, fps: number): string {
  if (dur <= 0 || (!fadeIn && !fadeOut)) return '1';
  const frames = Math.max(1, Math.round(seg * fps));
  const end = (frames - 1) / fps;
  const clock = `(max(0\\,n-1)/${num(fps)})`;
  const rise = `min(1\\,${clock}/${num(dur)})`;
  const fall = `min(1\\,max(0\\,(${num(end)}-${clock})/${num(dur)}))`;
  if (fadeIn && fadeOut) return `min(${rise}\\,${fall})`;
  if (fadeIn) return rise;
  if (fadeOut) return fall;
  return '1';
}

/** Integer pixel size that tracks the animated value (1px steps, never 0). */
function intExpr(expr: string): string {
  return `max(1\\,round(${expr}))`;
}

function sec(value: number): string {
  return String(Math.round(value * 1e6) / 1e6);
}


function snapBox(
  x: number,
  y: number,
  w: number,
  h: number,
  frameW: number,
  frameH: number,
): { x: number; y: number; w: number; h: number } {
  let nx = x;
  let ny = y;
  let nw = w;
  let nh = h;
  if (nx <= 1) nx = 0;
  if (ny <= 1) ny = 0;
  if (nx + nw >= frameW - 1) nw = frameW - nx;
  if (ny + nh >= frameH - 1) nh = frameH - ny;
  return { x: nx, y: ny, w: Math.max(1, nw), h: Math.max(1, nh) };
}

interface LShapeMargins {
  /** Fraction of the artwork width taken by the left bar. */
  left: number;
  /** Fraction of the artwork height taken by the bottom bar. */
  bottom: number;
}

/** Used when the alpha window cannot be measured; matches the shipped L-shape creatives. */
const DEFAULT_L_MARGINS: LShapeMargins = { left: 0.23, bottom: 0.23 };
const lShapeMarginCache = new Map<string, LShapeMargins>();


function measureLShapeMargins(imagePath: string): Promise<LShapeMargins> {
  const cached = lShapeMarginCache.get(imagePath);
  if (cached) return Promise.resolve(cached);

  const sample = 200;
  return new Promise((resolve) => {
    const proc = spawn('ffmpeg', [
      '-v', 'error',
      '-i', imagePath,
      '-vf', `alphaextract,scale=${sample}:${sample}:flags=neighbor`,
      '-frames:v', '1',
      '-f', 'rawvideo',
      '-pix_fmt', 'gray',
      'pipe:1',
    ]);
    const chunks: Buffer[] = [];
    proc.stdout.on('data', (d: Buffer) => chunks.push(d));
    proc.stderr.on('data', () => undefined);
    const finish = (margins: LShapeMargins) => {
      lShapeMarginCache.set(imagePath, margins);
      resolve(margins);
    };
    proc.on('error', () => finish(DEFAULT_L_MARGINS));
    proc.on('close', (code) => {
      const buf = Buffer.concat(chunks);
      if (code !== 0 || buf.length < sample * sample) {
        finish(DEFAULT_L_MARGINS);
        return;
      }
      let minX = sample;
      let maxY = -1;
      for (let y = 0; y < sample; y++) {
        for (let x = 0; x < sample; x++) {
          if (buf[y * sample + x] < 16) {
            if (x < minX) minX = x;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxY < 0) {
        finish(DEFAULT_L_MARGINS);
        return;
      }
      const left = minX / sample;
      const bottom = (sample - 1 - maxY) / sample;
      const plausible = (v: number) => v >= 0.05 && v <= 0.6;
      finish(plausible(left) && plausible(bottom) ? { left, bottom } : DEFAULT_L_MARGINS);
    });
  });
}


function lShapeFilter(input: {
  width: number;
  height: number;
  box: { x: number; y: number; w: number; h: number };
  progress: string;
  animated: boolean;
  margins: LShapeMargins;
  scaleFlags: string;
  restorePts: string;
}): string {
  const { width, height, box, progress, animated, margins, scaleFlags, restorePts } = input;
  const leftFull = Math.max(1, Math.round(margins.left * box.w));
  const bottomFull = Math.max(1, Math.round(margins.bottom * box.h));
  const leftExpr = animated ? intExpr(`${sec(margins.left)}*${box.w}*(${progress})`) : String(leftFull);
  const bottomExpr = animated ? intExpr(`${sec(margins.bottom)}*${box.h}*(${progress})`) : String(bottomFull);
  const videoW = animated ? `max(1\\,${width}-(${leftExpr}))` : String(Math.max(1, width - leftFull));
  const videoH = animated ? `max(1\\,${height}-(${bottomExpr}))` : String(Math.max(1, height - bottomFull));
  // Right-align so the program's left edge is the left bar's right edge.
  const videoX = animated ? 'ow-iw' : String(width - Number(videoW));
  const evalMode = animated ? ':eval=frame' : '';
  const leftCropW = `max(2\\,trunc(iw*${sec(margins.left)}))`;
  const sideCropH = `max(2\\,trunc(ih*${sec(1 - margins.bottom)}))`;
  const bottomCropH = `max(2\\,trunc(ih*${sec(margins.bottom)}))`;

  return (
    `[0:v]setpts=PTS-STARTPTS,format=yuv444p,setsar=1,` +
    `scale=w='${videoW}':h='${videoH}'${evalMode}:flags=${scaleFlags},setsar=1,` +
    `pad=${width}:${height}:'${videoX}':0:color=black${evalMode},setsar=1[base];` +
    `[1:v]format=rgba,split[lsrc][bsrc];` +
    `[lsrc]crop=w='${leftCropW}':h='${sideCropH}':x=0:y=0,setsar=1,` +
    `scale=w='${leftExpr}':h='${videoH}'${evalMode}:flags=${scaleFlags},setsar=1,` +
    `pad=${width}:${height}:0:0:color=black@0${evalMode},setsar=1[leftbar];` +
    `[bsrc]crop=w=iw:h='${bottomCropH}':x=0:y='ih-out_h',setsar=1,` +
    `scale=w=${width}:h='${bottomExpr}'${evalMode}:flags=${scaleFlags},setsar=1,` +
    `pad=${width}:${height}:0:'${height}-ih':color=black@0${evalMode},setsar=1[botbar];` +
    `[base][leftbar]overlay=0:0:eof_action=pass:format=auto[withleft];` +
    `[withleft][botbar]overlay=0:0:eof_action=pass:shortest=1:format=auto,format=yuv420p${restorePts}[vout]`
  );
}

/** First video frame PTS, so the re-encoded segment can keep the source timeline. */
function probeVideoStartTime(input: string): Promise<number | null> {
  return new Promise((resolve) => {
    const proc = spawn('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=start_time',
      '-of', 'default=nokey=1:noprint_wrappers=1',
      input,
    ]);
    let stdout = '';
    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.on('error', () => resolve(null));
    proc.on('close', (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }
      const value = Number(stdout.trim());
      resolve(Number.isFinite(value) ? value : null);
    });
  });
}


export class FfmpegOverlayJob {
  constructor(private readonly input: FfmpegOverlayJobInput) {}

  async run(): Promise<AdSegmentRecord> {
    const { insertionId, profile, mediaSequence, sourceSegmentUrl, adCreative } = this.input;

    const outputDir = await adSegmentStore.ensureOutputDir(insertionId, profile.profileId);
    const ext = profile.containerType === 'fmp4' ? 'm4s' : 'ts';
    const fileName = `seg-${mediaSequence}.${ext}`;
    const outputPath = path.join(outputDir, fileName);

    const imagePath = path.join(ADS_IMAGES_DIR, adCreative.imagePath);
    const [startTime, margins] = await Promise.all([
      probeVideoStartTime(sourceSegmentUrl),
      adCreative.category === 'l-shape' ? measureLShapeMargins(imagePath) : Promise.resolve(null),
    ]);
    const args = this.buildArgs(outputPath, startTime, margins);

    await this.spawnFfmpeg(args);

    const record: AdSegmentRecord = {
      adSegmentId: uuidv4(),
      insertionId,
      profileId: profile.profileId,
      mediaSequence,
      filePath: outputPath,
      fileName,
      createdAt: Date.now(),
    };
    adSegmentStore.register(record);
    return record;
  }

  private buildArgs(outputPath: string, startTime: number | null, margins: LShapeMargins | null): string[] {
    const { profile, overlay, adCreative, segmentDurationSec, sourceSegmentUrl, fadeIn, fadeOut } =
      this.input;

    const width = profile.resolution.width || 1280;
    const height = profile.resolution.height || 720;
    const fps = profile.frameRate || 25;
    const gop = profile.gopFrames || Math.round(fps * 2);
    const bitrate = profile.videoBitrateKbps || 2000;
    const imagePath = path.join(ADS_IMAGES_DIR, adCreative.imagePath);
    const box = snapBox(
      pct(overlay.xPct, width),
      pct(overlay.yPct, height),
      pct(overlay.widthPct, width),
      pct(overlay.heightPct, height),
      width,
      height,
    );


    const progress = growExpr(fadeIn, fadeOut, overlay.transitionDurationSec, segmentDurationSec, fps);
    const animated = progress !== '1';
    const scaleFlags = 'lanczos+accurate_rnd+full_chroma_int';
    const evalMode = animated ? ':eval=frame' : '';
    const restorePts = startTime != null ? `,setpts=PTS+${sec(startTime)}/TB` : '';

    // Bottom banner: width stays put, height grows from the bottom edge, and
    // the video keeps the full frame width while its height gives up exactly
    // the pixels the banner takes.
    const adW = String(box.w);
    const adH = animated ? intExpr(`${box.h}*(${progress})`) : String(box.h);
    const videoW = String(width);
    const videoH = animated ? `max(1\\,${height}-(${adH}))` : String(Math.max(1, height - box.h));
    const bannerFilter =
      `[0:v]setpts=PTS-STARTPTS,format=yuv444p,setsar=1,` +
      `scale=w='${videoW}':h='${videoH}'${evalMode}:flags=${scaleFlags},setsar=1,` +
      `pad=${width}:${height}:0:0:color=black${evalMode},setsar=1[base];` +
      `[1:v]format=rgba,setsar=1,` +
      `scale=w='${adW}':h='${adH}'${evalMode}:flags=${scaleFlags},setsar=1,` +
      `pad=${box.w}:${box.h}:0:'oh-ih':color=black@0${evalMode},setsar=1[ad];` +
      `[base][ad]overlay=x=${box.x}:y=${box.y}:eof_action=pass:shortest=1:format=yuv444,` +
      `format=yuv420p${restorePts}[vout]`;

    const filterComplex = margins
      ? lShapeFilter({ width, height, box, progress, animated, margins, scaleFlags, restorePts })
      : bannerFilter;

    const commonOutputArgs = [
      '-map', '[vout]',
      '-map', '0:a?',
      '-c:v', 'libx264',
      // '-preset', 'veryfast',
      '-pix_fmt', 'yuv420p',
      '-bf', '0',
      '-flags', '+cgop',
      '-sc_threshold', '0',
      '-g', String(gop),
      '-keyint_min', String(gop),
      '-b:v', `${bitrate}k`,
      '-maxrate', `${bitrate}k`,
      '-bufsize', `${bitrate * 2}k`,
      // Passthrough keeps the source frame count. Forcing `-r` samples the
      // gap before the first video frame (audio leads by one AAC priming
      // packet) and that sample is a black frame at every segment cut.
      '-vsync', '0',
      '-c:a', 'copy',
    ];

    const containerArgs =
      profile.containerType === 'fmp4'
        ? ['-f', 'mp4', '-movflags', '+frag_keyframe+empty_moov+default_base_moof']
        : ['-f', 'mpegts', '-muxdelay', '0', '-muxpreload', '0'];

    return [
      '-y',
      // Keep the source timeline so the next segment's PTS continues from
      // this one. Without it every segment restarts at 0 and the player
      // flashes black while it resyncs.
      ...(startTime != null ? ['-copyts'] : []),
      '-i', sourceSegmentUrl,
      '-loop', '1',
      '-framerate', String(fps),
      '-t', String(segmentDurationSec + 1),
      '-i', imagePath,
      '-filter_complex', filterComplex,
      ...commonOutputArgs,
      ...(startTime != null ? ['-avoid_negative_ts', 'disabled'] : []),
      ...containerArgs,
      outputPath,
    ];
  }

  private spawnFfmpeg(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('ffmpeg', args);
      let stderr = '';
      proc.stderr.on('data', (d) => (stderr += d.toString()));
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-2000)}`));
      });
    });
  }
}
