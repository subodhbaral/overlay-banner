import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import type { Request, Response } from 'express';
import { ANALYTICS_DIR, SESSIONS_LOG_FILE } from '../utils/paths.js';

const COOKIE_NAME = 'sid';
/** Drop a viewer who has not hit a manifest or ad segment inside this window. */
export const SESSION_ACTIVE_TTL_MS = 2 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ViewerSession {
  sessionId: string;
  ip?: string;
  userAgent?: string;
  device?: string;
  profileId?: string;
  firstSeen: number;
  lastSeen: number;
}

export type SessionPatch = Partial<Pick<ViewerSession, 'profileId' | 'device'>>;

type SessionAnalytics = Pick<ViewerSession, 'sessionId' | 'firstSeen' | 'lastSeen' | 'ip' | 'userAgent' | 'device'>;

/**
 * Anonymous viewer identity for playlist and ad-segment requests.
 *
 * The session id is minted only by `establish`, which the master manifest
 * route calls. Every other route uses `observe`: a known, still-active id
 * is refreshed and returned; a missing or expired id is ignored so the
 * request can continue without analytics.
 *
 * The cookie is scoped to this API host. On HTTPS it is SameSite=None,
 * Secure, and Partitioned so a player page on another origin can send it
 * back on credentialed playlist and segment requests.
 */
export class SessionCookie {
  private sessions = new Map<string, ViewerSession>();

  establish(req: Request, res: Response): ViewerSession {
    const now = Date.now();
    this.prune(now);

    const existing = this.active(this.read(req), now);
    if (existing) {
      this.apply(existing, req, now);
      this.logSessionAnalytics(existing);
      return existing;
    }

    const session: ViewerSession = {
      sessionId: crypto.randomUUID(),
      firstSeen: now,
      lastSeen: now,
    };
    this.apply(session, req, now);
    this.sessions.set(session.sessionId, session);
    res.append('Set-Cookie', this.cookieHeader(session.sessionId, req));
    this.logSessionAnalytics(session);
    return session;
  }

  /** Sessions still inside the active window, newest activity first. */
  listActive(now = Date.now()): ViewerSession[] {
    this.prune(now);
    return [...this.sessions.values()].sort((a, b) => b.lastSeen - a.lastSeen);
  }

  /**
   * Return the caller's active session, refreshing last-seen and any
   * supplied fields. Returns undefined when the cookie is absent or the
   * id was never created on the master manifest.
   */
  observe(req: Request, patch?: SessionPatch): ViewerSession | undefined {
    const now = Date.now();
    this.prune(now);
    const session = this.active(this.read(req), now);
    if (!session) return undefined;
    this.apply(session, req, now, patch);
    return session;
  }

  private active(sessionId: string | undefined, now: number): ViewerSession | undefined {
    if (!sessionId) return undefined;
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    if (now - session.lastSeen > SESSION_ACTIVE_TTL_MS) {
      this.sessions.delete(sessionId);
      return undefined;
    }
    return session;
  }

  private apply(session: ViewerSession, req: Request, now: number, patch?: SessionPatch): void {
    session.lastSeen = now;
    session.ip = req.ip;
    session.userAgent = req.get('user-agent') ?? undefined;
    const device = patch?.device ?? req.get('sec-ch-ua-platform') ?? undefined;
    if (device) session.device = device;
    if (patch?.profileId) session.profileId = patch.profileId;
  }

  private logSessionAnalytics(session: ViewerSession): void {
    const line: SessionAnalytics = {
      sessionId: session.sessionId,
      firstSeen: session.firstSeen,
      lastSeen: session.lastSeen,
      ip: session.ip,
      userAgent: session.userAgent,
      device: session.device,
    };
    fs.appendFile(SESSIONS_LOG_FILE, JSON.stringify(line) + '\n', 'utf-8');
  }

  private read(req: Request): string | undefined {
    const header = req.headers.cookie;
    if (!header) return undefined;
    for (const part of header.split(';')) {
      const eq = part.indexOf('=');
      if (eq === -1) continue;
      if (part.slice(0, eq).trim() !== COOKIE_NAME) continue;
      let value: string;
      try {
        value = decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return undefined;
      }
      return UUID_RE.test(value) ? value : undefined;
    }
    return undefined;
  }

  private cookieHeader(sessionId: string, req: Request): string {
    const parts = [`${COOKIE_NAME}=${sessionId}`, 'Path=/', 'HttpOnly'];
    const secure = req.secure || req.get('x-forwarded-proto') === 'https';
    if (secure) {
      parts.push('Secure', 'SameSite=None', 'Partitioned');
    } else {
      parts.push('SameSite=Lax');
    }
    return parts.join('; ');
  }

  private prune(now: number): void {
    for (const [id, session] of this.sessions) {
      if (now - session.lastSeen > SESSION_ACTIVE_TTL_MS) this.sessions.delete(id);
    }
  }
}

export const sessionCookie = new SessionCookie();
