import { Router } from 'express';
import { buildAnalyticsReport } from '../modules/AnalyticsService.js';
import type { SessionCookie } from '../modules/SessionCookie.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/** Summaries of the session log and the heartbeat log for the operator dashboard. */
export function analyticsRouter(sessions: SessionCookie): Router {
  const router = Router();

  router.get(
    '/api/analytics',
    asyncHandler(async (_req, res) => {
      res.json(await buildAnalyticsReport(sessions));
    }),
  );

  return router;
}
