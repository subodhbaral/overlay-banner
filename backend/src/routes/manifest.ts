import { Router } from 'express';
import { ManifestBuilder } from '../modules/ManifestBuilder.js';
import { StreamController } from '../modules/StreamController.js';
import { ConfigStore } from '../modules/ConfigStore.js';
import { SessionCookie } from '../modules/SessionCookie.js';
import { asyncHandler } from '../utils/asyncHandler.js';

function selfBaseUrl(req: import('express').Request): string {
  return `${req.protocol}://${req.get('host')}`;
}

export function manifestRouter(
  builder: ManifestBuilder,
  streamController: StreamController,
  configStore: ConfigStore,
  sessions: SessionCookie,
): Router {
  const router = Router();

  router.get(
    '/manifest/master.m3u8',
    asyncHandler(async (req, res) => {
      const poller = streamController.getPoller();
      if (!poller) {
        res.status(503).json({ error: 'Stream is OFF' });
        return;
      }
      const text = builder.buildMasterManifest(poller.getProfiles(), selfBaseUrl(req));
      sessions.establish(req, res);
      res.set('Content-Type', 'application/vnd.apple.mpegurl');
      res.send(text);
    }),
  );

  router.get(
    '/manifest/:profileId.m3u8',
    asyncHandler(async (req, res) => {
      const poller = streamController.getPoller();
      if (!poller) {
        res.status(503).json({ error: 'Stream is OFF' });
        return;
      }
      try {
        const config = await configStore.get();
        const text = builder.buildVariantManifest(req.params.profileId, config, selfBaseUrl(req));
        sessions.observe(req, { profileId: req.params.profileId });
        res.set('Content-Type', 'application/vnd.apple.mpegurl');
        res.set('Cache-Control', 'no-cache');
        res.send(text);
      } catch (err) {
        res.status(404).json({ error: (err as Error).message });
      }
    }),
  );

  return router;
}
