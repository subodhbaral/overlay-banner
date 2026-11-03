import { spawn } from 'node:child_process';

export interface ProbedMediaProperties {
  containerType: 'ts' | 'fmp4' | 'unknown';
  width: number;
  height: number;
  codecName: string;
  frameRate: number;
  videoBitrateKbps?: number;
  gopFrames?: number;
  durationSec?: number;
}

/**
 * Runs ffprobe against a local file or remote URL and extracts the media
 * properties needed to configure a matching ffmpeg overlay/encode job:
 * resolution, codec, frame rate, bitrate, and container type.
 */
export function probeMediaProperties(input: string): Promise<ProbedMediaProperties> {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries',
      'stream=codec_name,width,height,r_frame_rate,bit_rate:format=format_name,duration,bit_rate',
      '-of', 'json',
      input,
    ];
    const proc = spawn('ffprobe', args);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe exited with code ${code}: ${stderr}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        const stream = parsed.streams?.[0] ?? {};
        const format = parsed.format ?? {};
        const [num, den] = String(stream.r_frame_rate ?? '0/1').split('/').map(Number);
        const frameRate = den ? num / den : 0;
        const formatName: string = format.format_name ?? '';
        const containerType: ProbedMediaProperties['containerType'] = formatName.includes('mp4')
          ? 'fmp4'
          : formatName.includes('mpegts')
            ? 'ts'
            : 'unknown';

        resolve({
          containerType,
          width: Number(stream.width ?? 0),
          height: Number(stream.height ?? 0),
          codecName: String(stream.codec_name ?? ''),
          frameRate,
          videoBitrateKbps: stream.bit_rate
            ? Math.round(Number(stream.bit_rate) / 1000)
            : format.bit_rate
              ? Math.round(Number(format.bit_rate) / 1000)
              : undefined,
          gopFrames: frameRate ? Math.round(frameRate * 2) : undefined, // heuristic fallback
          durationSec: format.duration ? Number(format.duration) : undefined,
        });
      } catch (err) {
        reject(err);
      }
    });
  });
}
