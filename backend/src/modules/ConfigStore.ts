import { CONFIG_FILE } from '../utils/paths.js';
import { readJsonIfExists, writeJsonAtomic } from '../utils/atomicFile.js';
import type { StreamConfig } from '../types/index.js';

const DEFAULT_CONFIG: StreamConfig = {
  channelId: 'default',
  hlsInputUrl: '',
  overlay: {
    adId: '',
    xPct: 2,
    yPct: 60,
    widthPct: 25,
    heightPct: 35,
    insertionDurationSec: 30,
    transitionDurationSec: 1,
  },
  pollIntervalMs: 4000,
  servingLagSegments: 4,
  manifestWindowSize: 20,
  status: 'OFF',
};

export class ConfigValidationError extends Error {}

/**
 * Loads/validates/persists the single-channel StreamConfig to config.json.
 * Writes are atomic (temp file + rename). The hlsInputUrl may only be
 * changed while status === 'OFF'.
 */
export class ConfigStore {
  private cached: StreamConfig | null = null;

  async load(): Promise<StreamConfig> {
    if (this.cached) return this.cached;
    const existing = await readJsonIfExists<StreamConfig>(CONFIG_FILE);
    this.cached = existing ?? { ...DEFAULT_CONFIG };
    if (!existing) {
      await writeJsonAtomic(CONFIG_FILE, this.cached);
    }
    return this.cached;
  }

  async get(): Promise<StreamConfig> {
    return this.load();
  }

  /** Synchronous accessor for already-loaded config; falls back to defaults if load() hasn't run yet. */
  getCachedSync(): StreamConfig {
    return this.cached ?? DEFAULT_CONFIG;
  }

  /**
   * Applies a partial update to the stored config, validating that the
   * HLS input URL is not changed while the stream is ON.
   */
  async update(patch: Partial<StreamConfig>): Promise<StreamConfig> {
    const current = await this.load();

    if (
      typeof patch.hlsInputUrl === 'string' &&
      patch.hlsInputUrl !== current.hlsInputUrl &&
      current.status === 'ON'
    ) {
      throw new ConfigValidationError('hlsInputUrl cannot change while stream status is ON');
    }

    const next: StreamConfig = {
      ...current,
      ...patch,
      overlay: { ...current.overlay, ...(patch.overlay ?? {}) },
      channelId: current.channelId, // immutable for MVP
    };

    validateConfig(next);

    this.cached = next;
    await writeJsonAtomic(CONFIG_FILE, next);
    return next;
  }

  /** Internal helper used by StreamController to flip status without going through full validation path. */
  async setStatus(status: StreamConfig['status']): Promise<StreamConfig> {
    const current = await this.load();
    const next = { ...current, status };
    this.cached = next;
    await writeJsonAtomic(CONFIG_FILE, next);
    return next;
  }
}

function validateConfig(config: StreamConfig): void {
  if (config.pollIntervalMs < 500) {
    throw new ConfigValidationError('pollIntervalMs must be >= 500');
  }
  if (config.servingLagSegments < 0) {
    throw new ConfigValidationError('servingLagSegments must be >= 0');
  }
  if (config.manifestWindowSize < 1) {
    throw new ConfigValidationError('manifestWindowSize must be >= 1');
  }
  const o = config.overlay;
  if (o.widthPct < 0 || o.widthPct > 100 || o.heightPct < 0 || o.heightPct > 100) {
    throw new ConfigValidationError('overlay width/height percentages must be within 0-100');
  }
  if (o.xPct < 0 || o.xPct > 100 || o.yPct < 0 || o.yPct > 100) {
    throw new ConfigValidationError('overlay x/y percentages must be within 0-100');
  }
  if (o.xPct + o.widthPct > 100.0001 || o.yPct + o.heightPct > 100.0001) {
    throw new ConfigValidationError('overlay box must fit within the video frame');
  }
}

export const configStore = new ConfigStore();
