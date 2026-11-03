import { Router } from 'express';
import path from 'node:path';
import { adsCatalogService } from '../modules/AdsCatalogService.js';
import { ADS_IMAGES_DIR } from '../utils/paths.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export function adsCatalogRouter(): Router {
  const router = Router();

  router.get(
    '/api/ads',
    asyncHandler(async (_req, res) => {
      const ads = await adsCatalogService.list();
      const withUrls = ads.map((a) => ({
        ...a,
        imageUrl: `/ads-catalog/images/${encodeURIComponent(a.imagePath)}`,
      }));
      res.json(withUrls);
    }),
  );

  router.get('/ads-catalog/images/:fileName', (req, res) => {
    let fileName: string;
    try {
      fileName = decodeURIComponent(req.params.fileName);
    } catch {
      res.status(400).end();
      return;
    }
    if (!fileName || fileName.includes('..') || path.isAbsolute(fileName)) {
      res.status(400).end();
      return;
    }
    const root = path.resolve(ADS_IMAGES_DIR);
    const abs = path.resolve(root, fileName);
    if (abs !== root && !abs.startsWith(root + path.sep)) {
      res.status(400).end();
      return;
    }
    res.sendFile(abs, (err) => {
      if (err) res.status(404).end();
    });
  });

  return router;
}
