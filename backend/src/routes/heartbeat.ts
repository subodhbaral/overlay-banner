import { Router } from 'express';
import { HeartbeatService } from '../modules/HeartbeatService.js';
import { SessionCookie } from '../modules/SessionCookie.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/** Explicit beacon endpoint, in addition to the implicit heartbeat fired by the ad segment route. */
export function heartbeatRouter(heartbeatService: HeartbeatService, sessions: SessionCookie): Router {
  const router = Router();

  router.post('/api/heartbeat', asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    if (!body.insertionId) {
      res.status(400).json({ error: 'insertionId is required' });
      return;
    }
    const session = sessions.observe(req, {
      profileId: typeof body.profileId === 'string' ? body.profileId : undefined,
      device: typeof body.device === 'string' ? body.device : undefined,
    });
    if (!session) {
      res.json({ recorded: false });
      return;
    }

    const result = await heartbeatService.record({
      insertionId: body.insertionId,
      sessionId: session.sessionId,
      profileId: session.profileId ?? 'unknown',
      device: session.device,
      userAgent: session.userAgent,
      ip: session.ip,
      timestamp: Date.now(),
    });
    res.json(result);
  }));

  return router;
}
