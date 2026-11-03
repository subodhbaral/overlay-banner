import express from 'express';
import cors from 'cors';
import fs from 'node:fs/promises';

import { configStore } from './modules/ConfigStore.js';
import { adsCatalogService } from './modules/AdsCatalogService.js';
import { SegmentStore } from './modules/SegmentStore.js';
import { StreamController } from './modules/StreamController.js';
import { adSegmentStore } from './modules/AdSegmentStore.js';
import { TranscodeQueue } from './modules/TranscodeQueue.js';
import { ManualInsertionScheduler } from './modules/InsertionScheduler.js';
import { ManifestBuilder } from './modules/ManifestBuilder.js';
import { heartbeatService } from './modules/HeartbeatService.js';
import { sessionCookie } from './modules/SessionCookie.js';

import { adsCatalogRouter } from './routes/adsCatalog.js';
import { configRouter } from './routes/config.js';
import { streamRouter } from './routes/stream.js';
import { insertRouter } from './routes/insert.js';
import { manifestRouter } from './routes/manifest.js';
import { segmentsRouter } from './routes/segments.js';
import { heartbeatRouter } from './routes/heartbeat.js';
import { analyticsRouter } from './routes/analytics.js';

import { DATA_DIR, AD_SEGMENTS_DIR, ANALYTICS_DIR, SEGMENT_CACHE_DIR } from './utils/paths.js';

const PORT = Number(process.env.PORT ?? 4000);
const AD_SEGMENT_RETENTION_MS = 30 * 60 * 1000; // 30 minutes

async function main() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(AD_SEGMENTS_DIR, { recursive: true });
  await fs.mkdir(ANALYTICS_DIR, { recursive: true });
  await fs.mkdir(SEGMENT_CACHE_DIR, { recursive: true });

  await configStore.load();
  await adsCatalogService.list();

  const segmentStore = new SegmentStore();
  const streamController = new StreamController(configStore, segmentStore);
  const transcodeQueue = new TranscodeQueue(segmentStore, 2);
  const insertionScheduler = new ManualInsertionScheduler(
    segmentStore,
    transcodeQueue,
    () => streamController.getPoller()?.getProfiles() ?? [],
    () => configStore.getCachedSync().servingLagSegments,
  );
  const manifestBuilder = new ManifestBuilder(segmentStore, adSegmentStore);

  adSegmentStore.startSweeper(AD_SEGMENT_RETENTION_MS); // clear old ad segments periodically

  const app = express();
  // Reflect the caller origin so a player on another host can send the
  // session cookie. A wildcard origin cannot be used with credentials.
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());

  app.use(adsCatalogRouter());
  app.use(configRouter(configStore));
  app.use(streamRouter(streamController));
  app.use(insertRouter(insertionScheduler, configStore));
  app.use(manifestRouter(manifestBuilder, streamController, configStore, sessionCookie));
  app.use(segmentsRouter(adSegmentStore, heartbeatService, sessionCookie));
  app.use(heartbeatRouter(heartbeatService, sessionCookie));
  app.use(analyticsRouter(sessionCookie));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  // Global error handler: catches anything forwarded via asyncHandler/next(err)
  // so a single bad request can't crash the whole process.
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    // eslint-disable-next-line no-console
    console.error('[UnhandledError]', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  });

  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`HLS Ad Overlay backend listening on http://localhost:${PORT}`);
  });

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  async function shutdown() {
    await streamController.stop().catch(() => undefined);
    adSegmentStore.stopSweeper();
    process.exit(0);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', err);
  process.exit(1);
});
