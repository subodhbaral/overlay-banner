import { Router } from 'express';
import { StreamController } from '../modules/StreamController.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export function streamRouter(streamController: StreamController): Router {
  const router = Router();

  router.post(
    '/api/stream/on',
    asyncHandler(async (_req, res) => {
      try {
        await streamController.start();
        res.json(await streamController.getStatus());
      } catch (err) {
        res.status(400).json({ error: (err as Error).message });
      }
    }),
  );

  router.post(
    '/api/stream/off',
    asyncHandler(async (_req, res) => {
      await streamController.stop();
      res.json(await streamController.getStatus());
    }),
  );

  router.get(
    '/api/stream/status',
    asyncHandler(async (_req, res) => {
      res.json(await streamController.getStatus());
    }),
  );

  return router;
}
