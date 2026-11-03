import { ConfigStore } from './ConfigStore.js';
import { SegmentStore } from './SegmentStore.js';
import { ManifestPoller } from './ManifestPoller.js';
import type { StreamStatusResponse } from '../types/index.js';

/**
 * Owns the lifecycle of the single channel's ManifestPoller. start() reads
 * the persisted StreamConfig, spins up a poller against hlsInputUrl, and
 * flips status to ON; stop() tears the poller down and flips status to OFF.
 */
export class StreamController {
  private poller: ManifestPoller | null = null;

  constructor(
    private readonly configStore: ConfigStore,
    private readonly segmentStore: SegmentStore,
  ) {}

  isRunning(): boolean {
    return this.poller !== null;
  }

  getPoller(): ManifestPoller | null {
    return this.poller;
  }

  async start(): Promise<void> {
    if (this.poller) return; // idempotent
    const config = await this.configStore.get();
    if (!config.hlsInputUrl) {
      throw new Error('hlsInputUrl must be configured before starting the stream');
    }

    this.segmentStore.reset();
    const windowCapacity = config.manifestWindowSize + config.servingLagSegments + 20;
    const poller = new ManifestPoller(
      config.hlsInputUrl,
      this.segmentStore,
      config.pollIntervalMs,
      windowCapacity,
    );
    poller.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error('[ManifestPoller]', err.message);
    });

    await poller.start();
    this.poller = poller;
    await this.configStore.setStatus('ON');
  }

  async stop(): Promise<void> {
    if (this.poller) {
      this.poller.stop();
      this.poller = null;
    }
    await this.configStore.setStatus('OFF');
  }

  async getStatus(): Promise<StreamStatusResponse> {
    const config = await this.configStore.get();
    const running = this.poller !== null;
    // A crash can leave the persisted flag ON after the poller is gone.
    // Report the process that is actually running, and heal the stored flag.
    if (running && config.status !== 'ON') {
      await this.configStore.setStatus('ON');
    } else if (!running && config.status !== 'OFF') {
      await this.configStore.setStatus('OFF');
    }
    return {
      status: running ? 'ON' : 'OFF',
      channelId: config.channelId,
      lastPollAt: this.poller?.lastPollAt ?? null,
      profileCount: this.poller?.getProfiles().length ?? 0,
      lastError: this.poller?.lastError ?? null,
    };
  }
}
