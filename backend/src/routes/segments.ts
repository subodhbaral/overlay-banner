import { Router } from 'express';
import { AdSegmentStore } from '../modules/AdSegmentStore.js';
import { HeartbeatService } from '../modules/HeartbeatService.js';
import { SessionCookie } from '../modules/SessionCookie.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Serves ffmpeg-generated ad segment files. In production this would be
 * replaced by redirecting to a CDN URL; for now files are read from local
 * disk. A fetch records an implicit heartbeat only when the caller already
 * has an active session from the master manifest. Players without that
 * cookie still receive the segment.
 */
export function segmentsRouter(
  adSegmentStore: AdSegmentStore,
  heartbeatService: HeartbeatService,
  sessions: SessionCookie,
): Router {
  const router = Router();

  router.get('/segments/ad/:insertionId/:profileId/:fileName', asyncHandler(async (req, res) => {
    const { insertionId, profileId, fileName } = req.params;
    if (fileName.includes('..') || fileName.includes('/')) {
      res.status(400).end();
      return;
    }
    const filePath = adSegmentStore.outputDirFor(insertionId, profileId) + '/' + fileName;

    const session = sessions.observe(req, { profileId });
    if (session) {
      heartbeatService
        .record({
          insertionId,
          sessionId: session.sessionId,
          profileId,
          userAgent: session.userAgent,
          ip: session.ip,
          device: session.device,
          timestamp: Date.now(),
        })
        .catch(() => undefined);
    }

    res.sendFile(filePath, (err) => {
      if (err) res.status(404).end();
    });
  }));

  return router;
}
