import { Router } from 'express';
import { ConfigStore, ConfigValidationError } from '../modules/ConfigStore.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export function configRouter(configStore: ConfigStore): Router {
  const router = Router();

  router.get(
    '/api/config',
    asyncHandler(async (_req, res) => {
      res.json(await configStore.get());
    }),
  );

  router.post(
    '/api/config',
    asyncHandler(async (req, res) => {
      try {
        const updated = await configStore.update(req.body ?? {});
        res.json(updated);
      } catch (err) {
        if (err instanceof ConfigValidationError) {
          res.status(400).json({ error: err.message });
        } else {
          throw err;
        }
      }
    }),
  );

  return router;
}
