import { Router } from 'express';
import { ManualInsertionScheduler } from '../modules/InsertionScheduler.js';
import { adsCatalogService } from '../modules/AdsCatalogService.js';
import { ConfigStore } from '../modules/ConfigStore.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export function insertRouter(
  scheduler: ManualInsertionScheduler,
  configStore: ConfigStore,
): Router {
  const router = Router();

  router.post(
    '/api/insert',
    asyncHandler(async (req, res) => {
    try {
      const body = req.body ?? {};
      const config = await configStore.get();

      const adId: string = body.adId ?? config.overlay.adId;
      const ad = await adsCatalogService.getById(adId);
      if (!ad) {
        res.status(400).json({ error: `Unknown adId: ${adId}` });
        return;
      }

      const overlay = {
        adId: ad.id,
        xPct: body.xPct ?? config.overlay.xPct,
        yPct: body.yPct ?? config.overlay.yPct,
        widthPct: body.widthPct ?? config.overlay.widthPct,
        heightPct: body.heightPct ?? config.overlay.heightPct,
        insertionDurationSec: body.durationSec ?? config.overlay.insertionDurationSec,
        transitionDurationSec: config.overlay.transitionDurationSec,
      };
      const durationSec: number = body.durationSec ?? config.overlay.insertionDurationSec;

      const job = scheduler.mark(ad, overlay, durationSec);
      res.status(202).json(job);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
    }),
  );

  return router;
}
